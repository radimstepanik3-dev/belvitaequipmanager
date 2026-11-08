// Supabase Edge Function „ai“: rozpoznání stroje z fotek a psaní inzerátů pomocí Claude.
// API klíč je uložen jako secret na serveru – do mobilů ani PC se nedostane.
//
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy ai
//
// Funkci smí volat jen přihlášení uživatelé (výchozí ověření JWT je zapnuté)
// a podporuje jen dvě pevně dané úlohy (recognize, listing).

import Anthropic from 'npm:@anthropic-ai/sdk@1.6.0';
import { AI_MODEL, buildTask, type AiTask } from '../_shared/prompts.ts';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type ImageType = (typeof ALLOWED)[number];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const client = new Anthropic(); // čte ANTHROPIC_API_KEY ze secrets

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = (await req.json()) as AiTask;
    if (body.task !== 'recognize' && body.task !== 'listing') return json({ error: 'Neznámá úloha.' }, 400);
    if (body.task === 'recognize' && !body.images?.length) return json({ error: 'Chybí fotografie.' }, 400);
    const { prompt, schema, images } = buildTask(body);

    const response = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
      messages: [
        {
          role: 'user',
          content: [
            ...images.map((img) => ({
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: (ALLOWED.includes(img.media_type as ImageType) ? img.media_type : 'image/jpeg') as ImageType,
                data: img.data,
              },
            })),
            { type: 'text' as const, text: prompt },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') return json({ error: 'AI požadavek odmítla.' }, 422);
    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return json({ error: 'AI nevrátila odpověď.' }, 502);
    return json(JSON.parse(text.text));
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'AI je přetížená, zkuste to za chvíli.' }, 429);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'Neplatný ANTHROPIC_API_KEY na serveru.' }, 500);
    if (e instanceof Anthropic.APIError) return json({ error: `AI chyba: ${e.message}` }, 502);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
