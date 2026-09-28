/* /llms.txt — the site in brief for AI assistants and the tools built on
 * them (the llms.txt convention: https://llmstxt.org). Plain Markdown: what
 * gravity.integration is, the facts people ask about, every connector by
 * name, and every published page with its title and description.
 *
 * Generated at build from the same data the pages render, so it cannot drift
 * from them: pages and their meta from the page collection (drafts skipped),
 * the connectors from integrationCategories, prices from each locale's
 * pricing section, capabilities from ui.ts, the technologies from the home
 * page, the case studies from their collection, the company from site.json.
 * What is written here is only the framing around those facts, in the
 * pages' own terms. English, because it is read by machines in every
 * language; the Polish pages keep their Polish titles and descriptions. */
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import site from '../data/site.json';
import { t, type Lang } from '../i18n/ui';
import { plainText } from '../lib/structured-data';

/* the order the navigation gives them */
const ORDER = ['home', 'czym-jest-esb', 'technologia', 'integracje', 'cennik', 'case-studies', 'pobieranie', 'kontakt', 'kalkulator', 'polityka-prywatnosci'];

const abs = (path: string) => new URL(path, site.siteUrl).href;
const flat = (text: string) => text.replace(/[  ]/g, ' ').replace(/‑/g, '-');
/** "2999" / "1,799" → "2,999 PLN" / "1,799 EUR" — the English site's grouping */
const money = (p: any) => `${String(p.price).replace(/\D/g, '').replace(/\B(?=(\d{3})+$)/g, ',')} ${p.currency}`;

export const GET: APIRoute = async () => {
  const pages = (await getCollection('pages')).filter((p) => !p.data.draft);
  const page = (slug: string, lang: Lang) => pages.find((p) => p.data.slug === slug && p.data.lang === lang);
  const url = (slug: string, lang: Lang) => abs(page(slug, lang)?.data.url ?? '/');
  const section = (slug: string, lang: Lang, test: (x: any) => boolean): any =>
    page(slug, lang)?.data.sections.find((x: any) => test(x));
  const listed = (lang: Lang) =>
    ORDER.map((slug) => page(slug, lang))
      .filter((p) => p !== undefined)
      .map((p) => `- [${p.data.seo.title}](${abs(p.data.url)}): ${p.data.seo.description}`);

  const categories = (await getCollection('integrationCategories')).sort((a, b) => a.data.order - b.data.order);

  /* The priced plans, English names, each with both sites' price: the Polish
     site sells in PLN, the English one in EUR. */
  const plans = (lang: Lang) =>
    (section('cennik', lang, (x) => x.acf_fc_layout === 'pricing')?.pricing ?? []).filter(
      (p: any) => p.currency && String(p.price ?? '').trim() !== '',
    );
  const [pl, en] = [plans('pl'), plans('en')];
  const pricing = en
    .map((p: any, i: number) =>
      Number(String(p.price).replace(/\D/g, '')) === 0
        ? `${plainText(p.name)}: free`
        : `${plainText(p.name)}: ${pl[i] ? `${money(pl[i])} (Polish site) / ` : ''}${money(p)} (English site)`,
    )
    .join('; ');

  const tech: any[] =
    section('home', 'en', (x) => x.acf_fc_layout === 'icons' && x.icons?.some((i: any) => i.title === 'Always-on-data'))?.icons ?? [];

  const cases = (await getCollection('caseStudies'))
    .filter((x) => x.data.lang === 'pl')
    .sort((a, b) => a.data.order - b.data.order)
    .map((x) => `${x.data.company}: ${x.data.systems.join(', ')}`)
    .join('; ');

  const s = t('en');
  const c = site.company;
  const body = `# ${site.siteName}

> ${site.siteName} is an enterprise service bus (ESB): software that connects ERP, CRM, WMS, e-commerce and other business systems through one data bus, with ready-made connectors configured visually rather than coded. It is made by ${c.name}, a Polish software company in the ${c.group.replace(/ sp\. z o\.o\.$/, '')} group. The site is in Polish at ${abs('/')} and in English at ${abs('/en/')}.

## Facts

- Runs on Windows and is installed on your own infrastructure (on-premises). Version 4. Installation takes about 15 minutes.
- ${site.marketingCount} ready-made connectors in ${categories.length} categories, listed by name below and at ${url('integracje', 'en')}.
- ${plainText(s('dl.cap2Html'))} ${plainText(s('dl.cap3Html'))}
- Its own technologies:
${tech.map((i) => `  - ${plainText(i.title)}: ${plainText(i.text)}`).join('\n')}
- Pricing, net, per instance, per year, with no limit on users — ${pricing}. A single use case covers one business purpose on one instance; the full commercial licence allows any number of connections between any number of systems. The free version is the full software, with no time limit on testing; a licence is needed once you go beyond testing. Implementing an integration environment is quoted on request. Details: ${url('cennik', 'en')}
- Deployments described in the case studies (${url('case-studies', 'en')}): ${cases}.
- A 15-minute live demo on request. Documentation: ${site.docs}
- Contact: ${c.email}. ${c.name}, registered office ${c.postal.street}, ${c.postal.code} ${c.postal.city}, Poland; KRS ${c.krs}, NIP ${c.nip}, REGON ${c.regon}.

## Connectors

${categories.map((x) => `- ${x.data.title_en ?? x.data.title} (${x.data.items.length}): ${x.data.items.map((i) => i.name).join(', ')}`).join('\n')}

## English pages

${listed('en').join('\n')}

## Polskie strony

${listed('pl').join('\n')}

## Documentation

- [gravity.integration documentation](${site.docs}): the software's interactive documentation.
`;

  return new Response(flat(body), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
