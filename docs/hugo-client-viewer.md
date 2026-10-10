# Hugo client-side viewer

ArchCode can render inline YAML in a Hugo Markdown page. The Hugo build keeps the
YAML as the source of truth; the reviewer's browser validates, lays out, and
renders the SVG diagram.

## Build the viewer

```bash
pnpm --filter @archcode/web build:hugo-viewer
cp apps/web/dist-hugo/archcode-viewer.js <hugo-site>/static/js/archcode-viewer.js
```

Load the script once in the Hugo layout:

```html
<script src="/js/archcode-viewer.js" defer></script>
```

## Shortcode

Create `<hugo-site>/layouts/shortcodes/archcode.html`:

```html
{{ $title := .Get "title" | default "Architecture diagram" }}
{{ $view := .Get "view" | default "" }}
{{ $showSource := .Get "showSource" | default "true" }}
<section class="archcode-viewer" data-view="{{ $view }}" data-show-source="{{ $showSource }}">
  <h2>{{ $title }}</h2>
  <div class="archcode-output" aria-live="polite"></div>
  <div class="archcode-diagnostics" aria-live="polite"></div>
  <pre class="archcode-source"><code>{{ .Inner | htmlEscape }}</code></pre>
</section>
```

Use it in Markdown:

```md
{{< archcode title="Document Platform" view="overview" >}}
version: 1
system:
  id: document-platform
  name: Document Platform

components:
  - id: api
    type: service
  - id: db
    type: database

relationships:
  - from: api
    to: db
    type: sql

views:
  - id: overview
    name: Overview
    include: ['*']
    direction: LR
{{< /archcode >}}
```

If JavaScript is disabled or rendering fails before startup, the YAML remains
visible in the page. Runtime validation errors are shown above the source.
