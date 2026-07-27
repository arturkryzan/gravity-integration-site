/* Parse the /case-studies/ ACF payload into real structure.
 *
 * The WordPress editor could only produce one thing per field — a blob of HTML —
 * so every structure on that page is faked with typography:
 *
 *   • the client name and the headline are ONE <h2>, glued with <br />
 *   • the fact sheet (Firma / Branża / Zatrudnienie / System ERP) is ONE <p>,
 *     with <br /> standing in for rows and <strong> standing in for labels
 *   • the bullet lists are ONE <p> whose items are separated by <br /> and
 *     marked with a literal "•" character — no <ul>, no <li>, so wrapped lines
 *     run back underneath the bullet and screen readers announce a paragraph
 *   • the gap between two case studies is a <style> tag plus <p>&nbsp;</p>
 *
 * This module reads that markup and returns what the author actually meant.
 * It re-authors NOTHING: every word, entity and inline tag is carried through
 * verbatim. The only characters that don't survive are the ones that were
 * standing in for markup — the "•" glyphs and the <br /> separators — because
 * their job is now done by real <ul>/<li> and <dl>/<dt>/<dd>.
 */

export interface CsImage {
  src: string;
  alt: string;
  width: number;
  height: number;
  /** `shot` = a screenshot or diagram (full-width figure);
      `mark` = a brand/system logo asset (small plate). */
  variant: 'shot' | 'mark';
}

export type CsBlock =
  | { kind: 'p'; html: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'fig'; img: CsImage };

export interface CsStage {
  /** "Wyzwanie" | "Rozwiązanie" | "Rezultaty" | "Moduł Grafbuilder" */
  heading: string;
  blocks: CsBlock[];
}

export interface CsFact {
  /** carries its source colon — this is the client's copy, not a label we wrote */
  label: string;
  value: string;
}

export interface CsStudy {
  /** kept as `section${originalIndex}` so the breadcrumb anchors don't move */
  anchor: string;
  nav: string;
  client: string;
  /** the second line of the source <h2>; raw HTML (carries &nbsp;) */
  title: string;
  facts: CsFact[];
  logo: CsImage | null;
  stages: CsStage[];
}

/* Every logo asset in this page's media set is 800×400; every screenshot and
   diagram is ≥1900 wide. The split is clean, so the asset's own dimensions
   decide how it's framed rather than a hand-maintained list of filenames. */
const SHOT_MIN_WIDTH = 1200;

const NODE_RE = /<(h2|h3|p)>([\s\S]*?)<\/\1>/g;
const BR_RE = /<br\s*\/?>\s*/;
const BR_SPLIT = /<br\s*\/?>/;

const stripTags = (s: string) => s.replace(/<[^>]+>/g, '');

/** A <p> that is really a definition list: every <br />-separated row opens
    with a bolded `Label:`. Bullet paragraphs open with "•" and prose doesn't
    open with <strong> at all, so neither is mistaken for one. */
function asFacts(inner: string): CsFact[] | null {
  const rows = inner.split(BR_SPLIT).map((r) => r.trim()).filter(Boolean);
  if (rows.length < 2) return null;
  const out: CsFact[] = [];
  for (const row of rows) {
    const m = row.match(/^<strong>([^<]+:)<\/strong>\s*([\s\S]*)$/);
    if (!m) return null;
    out.push({ label: m[1], value: m[2].trim() });
  }
  return out;
}

/** A <p> that is really a list: items separated by <br />, each opened with "•". */
function asList(inner: string): string[] | null {
  if (!/^\s*•/.test(inner)) return null;
  const items = inner
    .split(BR_SPLIT)
    .map((s) => s.trim().replace(/^•(?:\s|&nbsp;)*/, '').trim())
    .filter(Boolean);
  return items.length ? items : null;
}

function toImage(raw: any): CsImage | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw.file ? '/' + raw.file : (raw.url ?? null);
  if (!src) return null;
  const width = Number(raw.width) || 0;
  const height = Number(raw.height) || 0;
  return {
    src,
    alt: raw.alt ?? '',
    width,
    height,
    variant: width >= SHOT_MIN_WIDTH ? 'shot' : 'mark',
  };
}

/**
 * @param sections the page's raw ACF `sections` array
 * @returns one entry per real case study; the `<style>`-tag spacer sections are
 *          dropped, since the thing they were spacing no longer exists
 */
export function parseCaseStudies(sections: any[]): CsStudy[] {
  const studies: CsStudy[] = [];

  sections.forEach((section, index) => {
    if (section?.acf_fc_layout !== 'text_img_link' || !Array.isArray(section.rows)) return;

    const study: CsStudy = {
      anchor: `section${index}`,
      nav: section.nav_li ?? '',
      client: '',
      title: '',
      facts: [],
      logo: null,
      stages: [],
    };

    /* Blocks that arrive before the first <h3> (there are none in the current
       payload, but a future study could open with a standfirst) land in an
       unheaded lead stage rather than being dropped. */
    let stage: CsStage = { heading: '', blocks: [] };
    const pushStage = () => {
      if (stage.heading || stage.blocks.length) study.stages.push(stage);
    };

    section.rows.forEach((row: any, rowIndex: number) => {
      const html: string = row?.text ?? '';
      NODE_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = NODE_RE.exec(html))) {
        const [, tag, inner] = m;

        if (tag === 'h2') {
          const [first, ...rest] = inner.split(BR_RE);
          study.client = stripTags(first).trim();
          study.title = rest.join(' ').trim();
          continue;
        }

        if (tag === 'h3') {
          pushStage();
          stage = { heading: inner.trim(), blocks: [] };
          continue;
        }

        const facts = !study.facts.length ? asFacts(inner) : null;
        if (facts) {
          study.facts = facts;
          continue;
        }

        const items = asList(inner);
        if (items) {
          stage.blocks.push({ kind: 'ul', items });
          continue;
        }

        const text = inner.trim();
        if (text && text !== '&nbsp;') stage.blocks.push({ kind: 'p', html: text });
      }

      /* The row's image belongs where the author put it — after that row's
         prose — with one exception: the opening row's logo IS the client's
         mark, so it goes to the study header instead of into the narrative. */
      const img = toImage(row?.img);
      if (!img) return;
      if (rowIndex === 0 && img.variant === 'mark' && !study.logo) {
        /* Two of the four logos shipped with an empty alt. The mark is
           decorative next to a heading that already names the client, but an
           empty alt on a lone image inside a header reads as an oversight —
           mirror the pattern the other two use. */
        study.logo = { ...img, alt: img.alt || `Logo firmy ${study.client}` };
        return;
      }
      stage.blocks.push({ kind: 'fig', img });
    });

    pushStage();
    studies.push(study);
  });

  return studies;
}
