package cz.watchcam.remote

import android.Manifest
import android.content.ContentValues
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.CountDownTimer
import android.provider.MediaStore
import android.view.View
import android.view.ViewGroup
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.core.view.doOnLayout
import androidx.core.view.updateLayoutParams
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import androidx.window.layout.WindowLayoutInfo
import cz.watchcam.remote.databinding.ActivityMainBinding
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {

    private lateinit var b: ActivityMainBinding
    private lateinit var link: WatchLink
    private var imageCapture: ImageCapture? = null
    private var lens = CameraSelector.LENS_FACING_BACK
    private var flashMode = ImageCapture.FLASH_MODE_AUTO
    private var countdown: CountDownTimer? = null

    private val cameraPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) startCamera() else setStatus("Bez oprávnění ke kameře to nepůjde")
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityMainBinding.inflate(layoutInflater)
        setContentView(b.root)

        link = WatchLink(this, ::setStatus) { cmd -> runOnUiThread { handle(cmd) } }
        link.start()

        b.shutter.setOnClickListener { takePhoto() }

        // Follow fold posture changes (flat / half-folded on a table)
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                WindowInfoTracker.getOrCreate(this@MainActivity)
                    .windowLayoutInfo(this@MainActivity)
                    .collect { applyPosture(it) }
            }
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED
        ) startCamera() else cameraPermission.launch(Manifest.permission.CAMERA)
    }

    override fun onDestroy() {
        countdown?.cancel()
        link.stop()
        super.onDestroy()
    }

    // ---------- Commands from the watch ----------
    private fun handle(cmd: JSONObject) {
        when (cmd.optString("cmd")) {
            "hello" -> sendReady()
            "shoot" -> { cancelCountdown(); takePhoto() }
            "countdown" -> showCountdown(cmd.optInt("seconds", 3))
            "switch" -> {
                lens = if (lens == CameraSelector.LENS_FACING_BACK)
                    CameraSelector.LENS_FACING_FRONT else CameraSelector.LENS_FACING_BACK
                startCamera()
            }
            "flash" -> {
                flashMode = when (cmd.optString("mode")) {
                    "on" -> ImageCapture.FLASH_MODE_ON
                    "off" -> ImageCapture.FLASH_MODE_OFF
                    else -> ImageCapture.FLASH_MODE_AUTO
                }
                imageCapture?.flashMode = flashMode
            }
        }
    }

    private fun sendReady() = link.send(
        JSONObject()
            .put("event", "ready")
            .put("lens", if (lens == CameraSelector.LENS_FACING_FRONT) "front" else "back")
    )

    // ---------- Camera ----------
    private fun startCamera() {
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            val provider = future.get()
            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(b.preview.surfaceProvider)
            }
            imageCapture = ImageCapture.Builder()
                .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                .setFlashMode(flashMode)
                .build()
            val selector = CameraSelector.Builder().requireLensFacing(lens).build()
            try {
                provider.unbindAll()
                provider.bindToLifecycle(this, selector, preview, imageCapture)
                sendReady()
            } catch (e: Exception) {
                setStatus("Kameru nelze spustit: ${e.message}")
                link.send(JSONObject().put("event", "error").put("text", "Kamera nedostupná"))
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun takePhoto() {
        val capture = imageCapture ?: return
        // The activity is not recreated on rotation/fold (see manifest), so save the
        // photo in the orientation the screen is showing right now.
        b.preview.display?.let { capture.targetRotation = it.rotation }
        val name = "WATCH_" + SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg")
            put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/WatchCam")
        }
        val output = ImageCapture.OutputFileOptions.Builder(
            contentResolver, MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values
        ).build()

        flashScreen()
        capture.takePicture(output, ContextCompat.getMainExecutor(this),
            object : ImageCapture.OnImageSavedCallback {
                override fun onImageSaved(r: ImageCapture.OutputFileResults) {
                    setStatus("Uloženo: $name")
                    link.send(JSONObject().put("event", "saved").put("name", name))
                }
                override fun onError(e: ImageCaptureException) {
                    setStatus("Chyba: ${e.message}")
                    link.send(JSONObject().put("event", "error").put("text", "Focení selhalo"))
                }
            })
    }

    // ---------- Foldable (Flex mode) ----------
    /**
     * When the phone stands half-folded with a horizontal hinge (tabletop posture),
     * the camera area is limited to the half above the hinge and shows the whole
     * frame. In every other posture it fills the window as before.
     */
    private fun applyPosture(info: WindowLayoutInfo) {
        val hingeTop = info.displayFeatures
            .filterIsInstance<FoldingFeature>()
            .firstOrNull {
                it.state == FoldingFeature.State.HALF_OPENED &&
                    it.orientation == FoldingFeature.Orientation.HORIZONTAL
            }?.bounds?.top

        b.root.doOnLayout { root ->
            // Hinge bounds are in window coordinates; the root may start below the status bar
            val rootTop = IntArray(2).also { root.getLocationInWindow(it) }[1]
            val topHalf = hingeTop?.minus(rootTop)?.takeIf { it > 0 }

            b.cameraArea.updateLayoutParams {
                height = topHalf ?: ViewGroup.LayoutParams.MATCH_PARENT
            }
            b.preview.scaleType =
                if (topHalf != null) PreviewView.ScaleType.FIT_CENTER
                else PreviewView.ScaleType.FILL_CENTER
        }
    }

    // ---------- UI helpers ----------
    private fun showCountdown(seconds: Int) {
        cancelCountdown()
        b.countdown.visibility = View.VISIBLE
        countdown = object : CountDownTimer(seconds * 1000L, 1000L) {
            override fun onTick(ms: Long) { b.countdown.text = ((ms + 999) / 1000).toString() }
            override fun onFinish() { b.countdown.visibility = View.GONE }
        }.start()
    }

    private fun cancelCountdown() {
        countdown?.cancel()
        b.countdown.visibility = View.GONE
    }

    private fun flashScreen() {
        b.flashOverlay.alpha = 0.8f
        b.flashOverlay.animate().alpha(0f).setDuration(250).start()
    }

    private fun setStatus(text: String) = runOnUiThread { b.status.text = text }
}
