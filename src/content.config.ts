import { defineCollection, z } from 'astro:content';
import { glob, file } from 'astro/loaders';

/** Resolved media reference (importer output) */
const mediaRef = z
  .object({
    file: z.string().nullable(),
    url: z.string().optional(),
    alt: z.string().default(''),
    wpId: z.number(),
  })
  .nullable();

/** One ACF flexible-content section, normalized. Layout-specific fields kept loose —
 *  components narrow them per acf_fc_layout. */
const section = z
  .object({
    acf_fc_layout: z.string(),
  })
  .passthrough();

const pages = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/pages' }),
  schema: z.object({
    wpId: z.number(),
    slug: z.string(),
    url: z.string(),
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
  loader: glob({ pattern: '*.json', base: './src/content/case-studies' }),
  schema: z.object({
    order: z.number(),
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
    parser: (t) => JSON.parse(t).categories.map((c: any) => ({ ...c, id: c.id })),
  }),
  schema: z.object({
    icon: z.string(),
    title: z.string(),
    description: z.string(),
    count: z.number(),
    items: z.array(z.object({ name: z.string(), sub: z.string() })),
  }),
});

export const collections = { pages, caseStudies, clients, integrationCategories };
