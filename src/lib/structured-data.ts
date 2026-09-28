/* Structured data (JSON-LD) for search engines and AI assistants.
 *
 * Every page carries one graph, its nodes linked by @id: the company
 * (Organization), the site (WebSite) and the page itself (WebPage). The
 * product pages add the product (SoftwareApplication) with its offers; pages
 * with an FAQ add an FAQPage. An assistant asked "who makes gravity.integration",
 * "what does it cost" or "does it run on Linux" finds the answer stated once,
 * in the same words the page shows.
 *
 * Nothing here is written for the markup alone. The register facts are the
 * ones /kontakt/ prints; prices come from the pricing page's own section and
 * the FAQ from the page's own FAQ, so the markup cannot quote a price or an
 * answer the page does not. */
import site from '../data/site.json';
import { getPage } from '../i18n/routes';
import { t, type Lang } from '../i18n/ui';
import { textOf } from './html';

export type Node = Record<string, unknown>;

const HOME = new URL('/', site.siteUrl).href;
export const ID = {
  org: `${HOME}#organization`,
  website: `${HOME}#website`,
  software: `${HOME}#software`,
};

/** Rich text as plain words: tags gone, entities decoded, and the site's
 *  typographic no-break spaces and hyphens back to plain ones — a machine
 *  reading "2 999 PLN" should not have to know what U+00A0 is. */
export function plainText(html: string | null | undefined): string {
  return textOf(html)
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/[  ]/g, ' ')
    .replace(/‑/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The company behind the product, as the register and /kontakt/ state it. */
export function organization(): Node {
  const c = site.company;
  return {
    '@type': 'Organization',
    '@id': ID.org,
    name: c.name,
    legalName: c.name,
    url: HOME,
    logo: new URL('/favicons/mark-512.png', site.siteUrl).href,
    email: c.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: c.postal.street,
      postalCode: c.postal.code,
      addressLocality: c.postal.city,
      addressCountry: c.postal.country,
    },
    taxID: c.nip,
    identifier: [
      { '@type': 'PropertyValue', propertyID: 'KRS', value: c.krs },
      { '@type': 'PropertyValue', propertyID: 'REGON', value: c.regon },
    ],
    parentOrganization: { '@type': 'Organization', name: c.group, url: c.groupUrl },
    brand: { '@type': 'Brand', name: site.siteName },
    sameAs: [site.linkedin, c.url],
  };
}

export function website(): Node {
  return {
    '@type': 'WebSite',
    '@id': ID.website,
    url: HOME,
    name: site.siteName,
    inLanguage: ['pl-PL', 'en-US'],
    publisher: { '@id': ID.org },
  };
}

type Section = { acf_fc_layout: string; [key: string]: any };

/** The product with its offers, in the page's language and currency. */
export async function softwareApplication(lang: Lang): Promise<Node> {
  const s = t(lang);
  const [home, pricing] = await Promise.all([getPage('home', lang), getPage('cennik', lang)]);
  const pricingUrl = new URL(pricing.data.url, site.siteUrl).href;
  const plans: any[] = (pricing.data.sections as Section[]).find((x) => x.acf_fc_layout === 'pricing')?.pricing ?? [];

  /* The plans that have a price; "Wdrożenie środowiska integracyjnego" is
     quoted on request and has none. "1,799" is the English page's grouping. */
  const offers = plans
    .filter((p) => p.currency && String(p.price ?? '').trim() !== '')
    .map((p) => {
      const price = String(p.price).replace(/[^\d.]/g, '');
      const offer: Node = {
        '@type': 'Offer',
        name: plainText(p.name),
        description: plainText(p.text),
        price,
        priceCurrency: p.currency,
        url: pricingUrl,
        seller: { '@id': ID.org },
      };
      /* Paid plans are a net price per instance per year (the pricing page's
         own words: "netto", "rocznie", "za instancję"). */
      if (Number(price) > 0) {
        offer.priceSpecification = {
          '@type': 'UnitPriceSpecification',
          price,
          priceCurrency: p.currency,
          valueAddedTaxIncluded: false,
          referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'ANN' },
        };
      }
      return offer;
    });

  /* What the product does, in the words the home and download pages use:
     the download page's three capabilities, then the four technologies from
     the home page's "Technologie" row. */
  const tech: any[] =
    (home.data.sections as Section[]).find(
      (x) => x.acf_fc_layout === 'icons' && x.icons?.some((i: any) => i.title === 'Always-on-data'),
    )?.icons ?? [];
  const featureList = [
    plainText(s('dl.cap1Html')),
    plainText(s('dl.cap2Html')),
    plainText(s('dl.cap3Html')),
    ...tech.map((i) => `${plainText(i.title)}: ${plainText(i.text)}`),
  ];

  return {
    '@type': 'SoftwareApplication',
    '@id': ID.software,
    name: site.siteName,
    description: home.data.seo.description.replace(/[  ]/g, ' '),
    url: new URL(home.data.url, site.siteUrl).href,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: lang === 'en' ? 'Enterprise service bus (ESB)' : 'Szyna integracyjna ESB (Enterprise Service Bus)',
    operatingSystem: 'Windows',
    softwareVersion: '4',
    featureList,
    softwareHelp: { '@type': 'CreativeWork', url: site.docs },
    publisher: { '@id': ID.org },
    offers,
  };
}

/** An FAQPage from a page's own FAQ section, or null if it has none. */
export function faqPage(sections: Section[]): Node | null {
  const faq: Array<{ que: string; ans: string }> = sections.find((x) => x.acf_fc_layout === 'faq')?.faq ?? [];
  if (!faq.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: plainText(f.que),
      acceptedAnswer: { '@type': 'Answer', text: plainText(f.ans) },
    })),
  };
}
