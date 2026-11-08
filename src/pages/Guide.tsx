import { useState, type ReactNode } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import { PageHeader } from '../components/ui';
import { cls } from '../lib/util';

/** Průvodce nákupem a dovozem stavebních strojů do ČR – praktický přehled pro obchodníky. */
export function Guide() {
  return (
    <>
      <PageHeader title="Průvodce nákupem a dovozem" subtitle="Jak nakoupit použitý stavební stroj v zahraničí a dovézt ho do ČR" />
      <div className="mb-4 flex gap-2 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          Jde o praktický přehled, ne o právní nebo daňové poradenství. Předpisy (DPH, clo, přeprava) se mění – u konkrétního obchodu si postup
          ověřte u svého daňového poradce, celního deklaranta nebo dopravce.
        </div>
      </div>

      <div className="space-y-3">
        <Section title="1. Kde hledat stroje" open>
          <ul>
            <li>
              <b>Inzertní portály:</b> Mascus, Machineryline, TruckScout24, Mobile.de (sekce stroje), Bazoš, Agriaffaires (zemědělské a manipulační
              technika).
            </li>
            <li>
              <b>Aukce:</b> Ritchie Bros. / IronPlanet, Euro Auctions, Troostwijk, Surplex, Klaravik, BVA Auctions, Vavato. K ceně se připočítává
              aukční poplatek (buyer’s premium), často 10–18 %, a dokumentační poplatek – vždy si ho zadejte do pole „Aukční poplatek“.
            </li>
            <li>
              <b>Dealeři a půjčovny:</b> vyřazované stroje z půjčoven (Boels, Cramo, Loxam, Zeppelin Rental…) mívají doloženou servisní historii.
            </li>
            <li>
              <b>Leasingové společnosti a insolvence:</b> stroje po ukončeném leasingu, dražby majetku.
            </li>
            <li>
              <b>Poptávky zákazníků:</b> v aplikaci v sekci Nákup → „Co zákazníci hledají“ – nakupujte i podle toho, co se reálně poptává.
            </li>
          </ul>
        </Section>

        <Section title="2. Prověření prodejce a stroje">
          <ul>
            <li>
              <b>Prodejce:</b> obchodní rejstřík dané země, recenze, jak dlouho působí. U firem z EU ověřte DIČ (VAT ID) v systému <b>VIES</b> – je to
              podmínka pro nákup bez DPH (reverse charge).
            </li>
            <li>
              <b>Podvody:</b> nereálně nízká cena, tlak na rychlou zálohu, platba na soukromý nebo zahraniční účet jiné země, změna čísla účtu
              e-mailem. Platbu vždy ověřte telefonicky na známém čísle.
            </li>
            <li>
              <b>Vlastnictví:</b> nechte si doložit, že stroj není na leasingu nebo zastaven; u dražších strojů si vyžádejte potvrzení od financující
              společnosti. Porovnejte výrobní číslo na štítku a na rámu.
            </li>
            <li>
              <b>Technický stav:</b> ideálně osobní prohlídka, jinak video prohlídka v reálném čase nebo nezávislá inspekce (u aukcí bývají
              inspekční zprávy). Postupujte podle kontrolního seznamu v kartě nákupu.
            </li>
            <li>
              <b>CE označení:</b> stroje z USA, Kanady či Japonska často nemají CE a jejich dodatečná certifikace pro trh EU je drahá – bez CE stroj
              nesmíte legálně uvést na trh v EU.
            </li>
          </ul>
        </Section>

        <Section title="3. DPH při nákupu">
          <Table
            head={['Situace', 'Jak to funguje', 'Co zadat v aplikaci']}
            rows={[
              [
                'Prodejce plátce DPH v jiném státě EU',
                'Faktura bez DPH s uvedením DIČ obou stran. DPH v ČR přiznáte a zároveň uplatníte nárok na odpočet (reverse charge) – pro plátce DPH cenově neutrální.',
                'Režim „Pořízení z EU“, cena bez DPH',
              ],
              ['Český plátce DPH', 'Faktura s DPH, odpočet DPH.', 'Režim „Tuzemsko“, cena bez DPH'],
              [
                'Obchodník v režimu použitého zboží (§ 90)',
                'Faktura bez vyčíslené DPH, odpočet nelze uplatnit. Při dalším prodeji lze za podmínek také využít zvláštní režim.',
                'Režim „Zvláštní režim“, celková cena',
              ],
              ['Soukromník / neplátce', 'Bez DPH. Při prodeji odvádíte DPH z celé prodejní ceny, pokud nepoužijete zvláštní režim.', 'Režim „Od neplátce“, celková cena'],
              ['Země mimo EU', 'DPH se platí při dovozu na celním úřadě (z celní hodnoty + clo + doprava do EU). Plátce si ji může odečíst.', 'Režim „Dovoz“, cena bez DPH, clo zvlášť'],
            ]}
          />
        </Section>

        <Section title="4. Dovoz ze zemí mimo EU (UK, Švýcarsko, Norsko, USA, Japonsko…)">
          <ul>
            <li>
              <b>Vývoz v zemi prodejce:</b> prodejce nebo jeho deklarant vystaví vývozní deklaraci (MRN) – bez ní nemá prodejce nárok na osvobození od
              své DPH.
            </li>
            <li>
              <b>Dovoz do EU:</b> celní deklarace v prvním přístavu / na hranici EU, nebo tranzit (T1) až do ČR a proclení u nás. Využijte celního
              deklaranta nebo speditéra – poplatek si zadejte do „Ostatní“.
            </li>
            <li>
              <b>Clo:</b> stavební stroje spadají typicky pod celní kódy 8429 (rypadla, dozery, nakladače, grejdry, válce) a 8430; pro řadu z nich je
              clo 0 %. Platnou sazbu ověřte v databázi <b>TARIC</b> nebo u deklaranta.
            </li>
            <li>
              <b>Velká Británie:</b> u zboží s britským původem lze uplatnit preferenční (nulové) clo na základě prohlášení o původu dle dohody EU–UK.
              DPH při dovozu se platí vždy.
            </li>
            <li>
              <b>Doklady:</b> faktura, CMR / konosament (B/L) u námořní přepravy, vývozní MRN, doklad o původu, CE prohlášení o shodě.
            </li>
            <li>
              <b>Zámoří (USA, Japonsko):</b> přeprava v kontejneru (menší stroje) nebo RoRo / flat-rack; počítejte s přístavními poplatky, čištěním
              stroje (fytosanitární kontrola zeminy) a delším termínem (4–8 týdnů).
            </li>
          </ul>
        </Section>

        <Section title="5. Přeprava do ČR">
          <ul>
            <li>
              <b>Běžné limity silniční přepravy v EU:</b> šířka 2,55 m, výška 4 m (včetně návěsu), celková hmotnost soupravy obvykle 40 t (u 5
              náprav). Rypadla nad cca 20–25 t a stroje širší než 2,55 m jsou zpravidla <b>nadrozměrná přeprava</b>.
            </li>
            <li>
              <b>Nadrozměrná přeprava:</b> potřebuje povolení v každé zemi na trase (v ČR povoluje silniční správní úřad / ŘSD podle kategorie
              silnic), od určitých rozměrů doprovodné vozidlo. Vyřizuje ji dopravce – počítejte s příplatkem a delším termínem.
            </li>
            <li>
              <b>Jak ušetřit:</b> demontáž lžíce, protizávaží, výfuku či majáku; u kolových strojů případně jízda po vlastní ose (jen s registrací).
            </li>
            <li>
              <b>Poptávka dopravy:</b> zadejte přesné rozměry a hmotnost (z technického listu), místo a čas nakládky, zda je k dispozici rampa nebo
              jeřáb. Nabídky lze získat přes burzy (Timocom, Trans.eu) nebo stálého dopravce.
            </li>
            <li>
              <b>Pojištění a předání:</b> CMR list, fotky stroje při nakládce (ze všech stran), pojištění nákladu na plnou hodnotu.
            </li>
          </ul>
        </Section>

        <Section title="6. Po příjezdu do ČR">
          <ul>
            <li>Vstupní kontrola, fotodokumentace a příprava k prodeji (servisní zakázka – náklady se automaticky připočtou k ceně stroje).</li>
            <li>
              <b>Registrace:</b> stroje, které mají jezdit po pozemních komunikacích (kolové nakladače, rypadlo-nakladače, manipulátory…), se
              registrují jako zvláštní vozidla – technická prohlídka a evidence; doklady z ciziny (např. německý Betriebserlaubnis) usnadní
              schválení.
            </li>
            <li>Vytvořte prodejní list a inzerát (AI) a nastavte cenu podle skutečných nákladů a cílové marže.</li>
          </ul>
        </Section>

        <Section title="7. Tipy pro prodej">
          <ul>
            <li>Kvalitní fotky: celý stroj ze 4 stran, kabina, displej s motohodinami, podvozek, lžíce, štítek. Čistý stroj se prodává rychleji.</li>
            <li>Uvádějte motohodiny, rok, výbavu a stav podvozku – kupující filtrují podle parametrů.</li>
            <li>Inzerujte i zahraničně (EN/DE inzerát z aplikace) – Mascus, Machineryline; nabídněte zajištění dopravy.</li>
            <li>Sledujte dobu na skladě – stroj, který stojí déle než nastavený limit, se v přehledu zvýrazní; zvažte slevu nebo protiúčet.</li>
            <li>Každého zájemce zapište a nastavte datum dalšího kontaktu – aplikace připomene, komu zavolat.</li>
          </ul>
        </Section>
      </div>
    </>
  );
}

function Section({ title, children, open: initial = false }: { title: string; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold text-slate-900">
        {title}
        <ChevronDown className={cls('h-5 w-5 shrink-0 text-slate-400 transition', open && 'rotate-180')} />
      </button>
      {open && <div className="guide border-t border-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-700">{children}</div>}
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 align-top">
          {rows.map((r) => (
            <tr key={r[0]}>
              {r.map((c, i) => (
                <td key={i} className={cls('px-4 py-2', i === 0 && 'font-medium text-slate-900')}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
