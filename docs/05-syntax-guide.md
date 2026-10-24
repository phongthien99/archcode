# ArchCode Syntax Guide

> YAML syntax reference for ArchCode schema v1. The architecture file is the
> source of truth: commit it to Git, review it in Pull Requests, validate it in
> CI, and render it as diagrams or HTML documentation.

## 1. Minimal File

A valid file needs `version` and `system`. If `views` is omitted, ArchCode
creates an implicit `all` view with every component. If `rules` is omitted,
ArchCode enables default warnings for circular dependencies and orphan
components.

```yaml
version: 1

system:
  id: document-platform
  name: Document Platform
  description: Upload, storage, and search platform for documents

components:
  - id: web-app
    type: frontend
    technology: React

  - id: document-service
    type: service
    technology: Go

  - id: document-db
    type: database
    technology: PostgreSQL

relationships:
  - from: web-app
    to: document-service
    type: http
    label: REST /documents

  - from: document-service
    to: document-db
    type: sql
```

## 2. General Rules

| Rule | Description |
|---|---|
| `version` | Currently only `1` is supported. |
| `id` | Lowercase letters, numbers, `.`, `_`, `-`; must start with a letter or number. Examples: `api-gateway`, `team.core`. |
| ID namespace | `groups` and `components` share one namespace because a view selector `<id>` can target either one. |
| Strings | Quote YAML values when they contain special characters, for example `label: "REST /documents"`. |
| Comments | YAML comments are supported. The web app tries to preserve comments and formatting when canvas edits update YAML. |

ArchCode supports two placements for architecture sections:

```yaml
# Recommended: top-level sections
system:
  id: example
  name: Example
components: []
relationships: []
```

```yaml
# Also valid: sections nested under system
system:
  id: example
  name: Example
  components: []
  relationships: []
```

Do not declare the same section in both places. For example, declaring
`components` at the top level and under `system` produces an `ambiguous-section`
error.

## 3. `system`

Describes the overall system.

| Field | Required | Description |
|---|---:|---|
| `id` | Yes | Stable system ID. |
| `name` | Yes | Display name. |
| `description` | No | Short system description. |
| `groups` | No | Group list, if you prefer nesting it under `system`. |
| `components` | No | Component list, if you prefer nesting it under `system`. |
| `relationships` | No | Relationship list, if you prefer nesting it under `system`. |

## 4. `groups`

Groups organize components by domain, layer, cluster, trust zone, network zone,
or any boundary that matters to the architecture. Groups can be nested with
`parent`.

```yaml
groups:
  - id: core
    name: Core Domain
    type: domain

  - id: data
    name: Data Layer
    type: trust-zone
    parent: core
```

| Field | Required | Description |
|---|---:|---|
| `id` | Yes | Group ID. Must not duplicate a component ID. |
| `name` | Yes | Display name. |
| `type` | No | Classification such as `domain`, `cluster`, `network`, `trust-zone`. |
| `description` | No | Group description. |
| `parent` | No | Parent group ID. Parent chains must not create cycles. |

## 5. `components`

A component is a node in the diagram. Only `id` and `type` are required; if
`name` is omitted, ArchCode uses the `id` as the display name.

```yaml
components:
  - id: api-gateway
    name: API Gateway
    type: gateway
    group: core
    technology: Kong
    owner: team-platform
    description: Public API entrypoint
    tags: [edge, critical]
```

| Field | Required | Description |
|---|---:|---|
| `id` | Yes | Stable component ID. |
| `type` | Yes | Node type. Unknown types still render, but produce a warning. |
| `name` | No | Display name. Defaults to `id`. |
| `group` | No | ID of the containing group. |
| `technology` | No | Framework, runtime, database, or infrastructure technology. |
| `description` | No | Component description. |
| `owner` | No | Owning team or person. |
| `tags` | No | Tags used by view selectors and rule matchers. |

Built-in component types:

```yaml
person, system, external, frontend, gateway, service, database, queue, storage, cache
```

## 6. `relationships`

A relationship is a directed edge between two components or groups. When an end
is a group ID, the connector attaches to the group frame. A group endpoint is only
drawn when the group appears in the view (it contains at least one visible
component). Rules (`no-circular`, `no-orphan`, `forbidden`) only consider
component-to-component relationships.

```yaml
relationships:
  - id: api-to-docs
    from: api-gateway
    to: document-service
    type: http
    label: REST /documents
    technology: REST
    description: Calls the document management API
```

| Field | Required | Description |
|---|---:|---|
| `from` | Yes | Source component or group ID. |
| `to` | Yes | Target component or group ID. |
| `id` | No | Stable relationship ID. If omitted, ArchCode generates an internal ID from `from->to`. |
| `type` | No | Protocol or relationship kind. |
| `label` | No | Label shown on the connector. |
| `description` | No | Relationship description. |
| `technology` | No | Technology used by the connection. |

Suggested relationship types:

```yaml
http, https, grpc, graphql, websocket, sql, tcp, amqp, kafka, event, async, webhook, s3, oidc
```

Asynchronous relationships are drawn with dashed connectors and can be ignored
by circular-dependency checks with `ignore: async`:

```yaml
amqp, kafka, event, async, mqtt, sns, sqs, pubsub
```

## 7. `views`

A view is one diagram over the same architecture model. A file can define many
views.

```yaml
views:
  - id: overview
    name: System Overview
    description: Main system components
    include: ['*']
    direction: LR

  - id: core-domain
    name: Core Domain
    include: ['group:core', api-gateway]
    exclude: ['type:storage']
    direction: TB
```

| Field | Required | Description |
|---|---:|---|
| `id` | Yes | View ID. |
| `name` | Yes | Display name. |
| `description` | No | View description. |
| `include` | No | Selectors to include. Defaults to `['*']`. |
| `exclude` | No | Selectors to remove after `include` is applied. |
| `direction` | No | `TB` for top-to-bottom or `LR` for left-to-right. Defaults to `TB`. |

Selectors for `include` and `exclude`:

| Selector | Meaning | Example |
|---|---|---|
| `*` | All components. | `include: ['*']` |
| `<id>` | Component or group by ID. | `include: [api-gateway]` |
| `group:<id>` | Components in a group, including nested groups. | `group:core` |
| `type:<type>` | Components by type. | `type:service` |
| `tag:<tag>` | Components with a tag. | `tag:critical` |

## 8. `rules`

Rules are lightweight fitness functions for validating architecture. `severity`
can be `error` or `warning`; custom rules default to `error` when severity is
omitted.

```yaml
rules:
  - id: no-cycles
    type: no-circular
    severity: error

  - id: no-sync-cycles
    type: no-circular
    severity: warning
    ignore: async

  - id: no-orphans
    type: no-orphan
    severity: warning

  - id: no-cross-domain-db
    type: forbidden
    severity: error
    description: Services must not access databases owned by another domain
    from: { type: service }
    to: { type: database }
    unless: same-group
```

| Rule type | Description |
|---|---|
| `no-circular` | Reports circular dependencies. Supports `ignore: async`. |
| `no-orphan` | Reports components with no relationships. `person` components are ignored. |
| `forbidden` | Forbids relationships matching `from` and `to`. Requires at least one matcher. |

Matcher syntax for `forbidden`:

```yaml
from:
  id: [api-gateway, document-service]
  type: service
  group: core
  tag: critical
to:
  type: database
```

| Matcher field | Meaning |
|---|---|
| `id` | Matches component IDs. |
| `type` | Matches component types. |
| `group` | Matches components in the group, including nested groups. |
| `tag` | Matches components with the tag. |

Inside one matcher, different fields are combined with AND. Values inside one
field are combined with OR. `unless: same-group` only ignores a relationship
when `from.group` and `to.group` are exactly equal; parent/child groups do not
count as the same group.

## 9. Separate Layout File

Node positions do not live in the architecture file. When you drag nodes on the
canvas, ArchCode stores positions in a sibling layout file named
`<name>.layout.yaml`, for example `architecture.layout.yaml`.

```yaml
version: 1
views:
  overview:
    nodes:
      api-gateway: { x: 320, y: 120 }
      document-service: { x: 620, y: 120 }
    edges:
      api-gateway->document-service:
        points:
          - [440, 160]
          - [560, 160]
```

Rules of thumb:

- The layout file is optional. Without it, ArchCode auto-layouts diagrams with ELK.
- Commit the layout file with the architecture file when node positions are part of the change.
- Unknown IDs in the layout file produce warnings, but do not fail the build.
- Use `--auto-layout` in the CLI to ignore the layout file.

## 10. Complete Example

```yaml
version: 1

system:
  id: document-platform
  name: Document Platform
  description: Upload, storage, and search platform for documents

groups:
  - id: core
    name: Core Domain
    type: domain
  - id: data
    name: Data Layer
    type: trust-zone
    parent: core

components:
  - id: end-user
    name: End User
    type: person

  - id: web-app
    name: Web App
    type: frontend
    technology: React
    owner: team-web

  - id: api-gateway
    name: API Gateway
    type: gateway
    technology: Kong

  - id: document-service
    name: Document Service
    type: service
    group: core
    technology: Go
    tags: [critical]

  - id: document-db
    name: Document DB
    type: database
    group: core
    technology: PostgreSQL

  - id: document-events
    name: Document Events
    type: queue
    technology: RabbitMQ

relationships:
  - from: end-user
    to: web-app
    type: https
    label: Uses

  - from: web-app
    to: api-gateway
    type: https

  - from: api-gateway
    to: document-service
    type: http
    label: REST /documents

  - from: document-service
    to: document-db
    type: sql

  - from: document-service
    to: document-events
    type: amqp
    label: Publish DocumentUploaded

views:
  - id: overview
    name: System Overview
    include: ['*']
    direction: LR

  - id: core-domain
    name: Core Domain
    include: ['group:core', api-gateway]
    exclude: ['type:queue']

rules:
  - id: no-cycles
    type: no-circular
    severity: error
    ignore: async

  - id: no-orphans
    type: no-orphan
    severity: warning

  - id: no-cross-domain-db
    type: forbidden
    severity: error
    from: { type: service }
    to: { type: database }
    unless: same-group
```

## 11. Validate And Build

```bash
# Validate one or more YAML files
pnpm archcode validate architecture.yaml

# Treat warnings as CI failures
pnpm archcode validate architecture.yaml --strict

# Export self-contained HTML
pnpm archcode build architecture.yaml -o out/architecture.html

# Export SVG for one view
pnpm archcode build architecture.yaml -f svg --view overview -o out/overview.svg

# Ignore the layout file and auto-layout again
pnpm archcode build architecture.yaml --auto-layout
```

Exit codes:

| Code | Meaning |
|---:|---|
| `0` | Valid. |
| `1` | Validation or rule errors. |
| `2` | File read error or invalid CLI arguments. |


## 12. Mind Maps (`kind: mindmap`)

A file with `kind: mindmap` is a mind map instead of an architecture model. The
web app opens it in Preview, where branches can be expanded and collapsed. The
CLI does not build mind maps yet.

```yaml
version: 1
kind: mindmap
style: notebook   # classic (default) | notebook
direction: LR     # both | LR | RL — notebook defaults to LR, classic to both
expandDepth: 1    # levels open when the file is opened

root:
  id: ddd
  text: Domain-Driven Design
  children:
    - id: strategic
      text: Strategic design
      children:
        - Bounded Context        # short form: a plain string is a node
        - text: Subdomain
          collapsed: true
          children: [Core, Supporting, Generic]
    - id: tactical
      text: Tactical design
      color: teal
      note: Shown as a tooltip
      tags: [review]

links:
  - from: strategic
    to: tactical
    label: shapes
```

Top-level fields:

| Field | Description |
|---|---|
| `style` | `classic`: level-2+ nodes are text on an underline, colors follow the main branch. `notebook`: every node is a rounded box, colors follow the depth, one-sided layout (NotebookLM-like). |
| `direction` | `both` splits main branches around the root; `LR` / `RL` grows to one side. |
| `expandDepth` | Integer ≥ 0. Nodes at this depth or deeper start collapsed. `notebook` defaults to `1` (only main branches visible); `classic` opens everything. |
| `root` | The root node (required). |
| `links` | Dashed cross-links between nodes that declare an explicit `id`. |

Node fields: `id`, `text`, `note`, `color` (`blue`, `orange`, `green`,
`violet`, `pink`, `teal`, `amber`, `red`, `indigo`, `sky`), `side` (`left` /
`right`, main branches only when `direction: both`), `collapsed`, `tags`,
`link` (a component ID in the architecture file), `children`.

Expanding and collapsing in Preview:

- Click the button on the outer edge of a node, or use the keyboard: arrow keys
  move between nodes, `Space` toggles, `Enter` jumps to the YAML line.
- Expand/collapse state is per file and per browser. It is not written to the
  YAML and is not part of undo history. `collapsed` and `expandDepth` in the file
  only set the initial state.
- SVG/PNG export uses the branches currently open in Preview.
- **Declare `id` on nodes whose state should survive edits.** Nodes without `id`
  get a position-based ID (`~0.1`). Inserting a sibling above shifts those IDs, so
  a remembered expand/collapse state can move to a different node.
