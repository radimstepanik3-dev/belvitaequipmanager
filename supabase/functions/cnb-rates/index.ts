// Supabase Edge Function „cnb-rates“: aktuální kurzy ČNB pro přepočet nákupních cen.
//   supabase functions deploy cnb-rates
import { fetchCnbRates } from '../_shared/cnb.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    return new Response(JSON.stringify(await fetchCnbRates()), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 502,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
