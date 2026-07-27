import { defineCollection, z } from 'astro:content';
import { glob, file } from 'astro/loaders';

/** Resolved media reference (importer output) */
const mediaRef = z
  .object({
    file: z.string().nullable(),
    url: z.string().nullable().optional(),
    alt: z.string().default(''),
    width: z.number().nullable().optional(),
    height: z.number().nullable().optional(),
    wpId: z.number().nullable().optional(),
  })
  .nullable();

/** One ACF flexible-content section, normalized. Layout-specific fields kept loose —
 *  components narrow them per acf_fc_layout. */
const section = z
  .object({
    acf_fc_layout: z.string(),
  })
  .passthrough();

/** Locale of a content entry. Defaults to 'pl' so the original Polish files need
 *  no edit — the field only has to be written in the English ones. */
const lang = z.enum(['pl', 'en']).default('pl');

/* The glob loader's default id is the file path — EXCEPT that it hands the
 * `slug` field priority if the entry has one, and ours does. Since `slug` is
 * deliberately identical across languages (that pairing is what links a page to
 * its translation), the default would give pl/home.json and en/home.json the
 * same id and one would silently overwrite the other. Deriving the id from the
 * path restores the property ids are supposed to have: uniqueness.
 *
 * Nothing reads ids directly — pages are resolved by (slug, lang) through
 * src/i18n/routes.ts — so the shape of this string is free. */
const idFromPath = ({ entry }: { entry: string }) => entry.replace(/\.json$/, '');

const pages = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/pages', generateId: idFromPath }),
  schema: z.object({
    wpId: z.number(),
    lang,
    /** Language-neutral key: the SAME string in both languages. `url` carries the
     *  localised path. That pairing is what links a page to its translation. */
    slug: z.string(),
    url: z.string(),
    /** Scaffolded but not yet translated. The page still builds — that's the
     *  point, it's how a translation gets reviewed — but it carries `noindex`,
     *  stays out of the sitemap, and is not offered by the language switcher or
     *  claimed by hreflang. Flipping one file to `false` is what "ship the
     *  English homepage first" means in practice. */
    draft: z.boolean().default(false),
    seo: z.object({
      title: z.string(),
      description: z.string(),
      focusKeyword: z.string().optional().default(''),
    }),
    h1: z.string(),
    decorative: z.union([z.boolean(), z.string(), z.number()]).nullable().optional(),
    newsletter: z.union([z.boolean(), z.string(), z.number()]).nullable().optional(),
    sections: z.array(section),
    wpContent: z.string().optional().default(''),
  }),
});

const caseStudies = defineCollection({
  loader: glob({
    pattern: '**/*.json',
    base: './src/content/case-studies',
    generateId: idFromPath,
  }),
  schema: z.object({
    order: z.number(),
    lang,
    anchor: z.string(), // preserved WP anchor: section0/2/4/6
    slug: z.string(),
    company: z.string(),
    systems: z.array(z.string()),
    navLabel: z.string(),
    rows: z.array(
      z
        .object({
          text: z.string().optional(),
          img: z.union([mediaRef, z.literal('')]).optional(),
          link: z.union([z.object({}).passthrough(), z.literal('')]).optional(),
        })
        .passthrough(),
    ),
    todo: z.string().nullable().optional(),
  }),
});

const clients = defineCollection({
  loader: file('./src/data/clients.json', {
    parser: (t) => JSON.parse(t).map((c: any) => ({ id: String(c.order), ...c })),
  }),
  schema: z.object({
    order: z.number(),
    name: z.string(),
    logo: mediaRef,
    caseStudyLink: z.string().nullable(),
  }),
});

const integrationCategories = defineCollection({
  loader: file('./src/data/integrations.json', {
    parser: (t) =>
      JSON.parse(t).categories.map((c: any, i: number) => ({ ...c, id: c.id, order: i })),
  }),
  schema: z.object({
    icon: z.string(),
    title: z.string(),
    description: z.string(),
    count: z.number(),
    order: z.number(),
    items: z.array(z.object({ name: z.string(), sub: z.string() })),
  }),
});

export const collections = { pages, caseStudies, clients, integrationCategories };
