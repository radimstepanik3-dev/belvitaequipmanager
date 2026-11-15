package cz.watchcam.remote

import android.content.Context
import android.util.Log
import com.huawei.wearengine.HiWear
import com.huawei.wearengine.auth.AuthCallback
import com.huawei.wearengine.auth.Permission
import com.huawei.wearengine.device.Device
import com.huawei.wearengine.p2p.Message
import com.huawei.wearengine.p2p.P2pClient
import com.huawei.wearengine.p2p.Receiver
import com.huawei.wearengine.p2p.SendCallback
import org.json.JSONObject

/**
 * Wraps Huawei Wear Engine P2P messaging with the watch app.
 * Messages are JSON objects in both directions.
 */
class WatchLink(
    private val context: Context,
    private val onStatus: (String) -> Unit,
    private val onCommand: (JSONObject) -> Unit,
) {
    private val p2p: P2pClient = HiWear.getP2pClient(context).apply {
        setPeerPkgName(context.getString(R.string.watch_bundle_name))
        setPeerFingerPrint(context.getString(R.string.watch_fingerprint))
    }
    private var device: Device? = null

    private val receiver = Receiver { message ->
        val text = message.data?.let { String(it, Charsets.UTF_8) } ?: return@Receiver
        Log.d(TAG, "from watch: $text")
        runCatching { JSONObject(text) }.onSuccess(onCommand)
    }

    fun start() {
        HiWear.getAuthClient(context).requestPermission(object : AuthCallback {
            override fun onOk(permissions: Array<out Permission>?) = findDevice()
            override fun onCancel() = onStatus("Oprávnění k hodinkám zamítnuto")
        }, Permission.DEVICE_MANAGER)
    }

    private fun findDevice() {
        HiWear.getDeviceClient(context).bondedDevices
            .addOnSuccessListener { devices ->
                val watch = devices.firstOrNull { it.isConnected }
                if (watch == null) {
                    onStatus("Hodinky nejsou připojené (Huawei Health)")
                    return@addOnSuccessListener
                }
                device = watch
                p2p.registerReceiver(watch, receiver)
                    .addOnSuccessListener { onStatus("Připojeno: ${watch.name}") }
                    .addOnFailureListener { onStatus("Chyba registrace: ${it.message}") }
            }
            .addOnFailureListener { onStatus("Chyba Wear Engine: ${it.message}") }
    }

    fun send(json: JSONObject) {
        val target = device ?: return
        val msg = Message.Builder()
            .setPayload(json.toString().toByteArray(Charsets.UTF_8))
            .build()
        p2p.send(target, msg, object : SendCallback {
            override fun onSendResult(resultCode: Int) {
                Log.d(TAG, "send result $resultCode")
            }
            override fun onSendProgress(progress: Long) {}
        })
    }

    fun stop() {
        device?.let { p2p.unregisterReceiver(receiver) }
    }

    companion object { private const val TAG = "WatchLink" }
}
