# Architecture

## Separation of responsibilities

| Area              | Runtime                     | Storage                                  | Public             |
| ----------------- | --------------------------- | ---------------------------------------- | ------------------ |
| Wiki              | Sites                       | Published snapshot / deployment database | Yes                |
| Mining admin      | Localhost only              | Local SQLite                             | No                 |
| Extractor         | Local CLI or background job | Raw game files                           | No                 |
| Source and schema | GitHub                      | Git                                      | Repository members |

## Data flow

1. The extractor reads the locally installed game files.
2. Parsed records are normalized into a local SQLite database.
3. The local admin compares new and existing records.
4. The operator reviews changes and removes private or unsafe fields.
5. A publish task creates a public snapshot or synchronizes the deployment database.
6. The public wiki reads only the published representation.

## Repository policy

Git tracks application source, schemas, migrations, fixtures made specifically for tests, and documentation.

Git does not track original game files, extracted assets, local databases, generated exports, credentials, or machine-specific paths.

## Planned applications

### Public wiki

The public application will provide search and category navigation for characters, weapons, sigils, skills, quests, enemies, items, and related records. Internal extraction paths and mining state must never be included in its build.

### Local mining admin

The admin application will bind to localhost by default. It will show extractor runs, import errors, schema validation, record differences, asset status, and publication controls. Publishing must be an explicit action.

## Publication strategy

The preferred long-term setup is:

- SQLite as the local source of truth
- a deployment database for searchable public records
- object storage for approved images and larger assets
- GitHub for source code only
- Sites for the public web application

A static JSON snapshot can be used for the first prototype before introducing a deployment database.

The version 1 public prototype snapshot exposes four allowlisted collections: `characters`, `weapons`, `sigils`, and `skills`. Each collection contains only its public identifier, slug, Korean display name, and the literal `published` review state. The wiki validates the complete snapshot before rendering it.
