import { BadRequestException, Injectable } from '@nestjs/common';
import { PERMISSIONS } from '@intandms/core';
import { Prisma } from '@prisma/client';
import { forbidden } from '../../common/forbidden.exception';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthPrincipal } from '../authorization/authorization.service';
import { AuthorizationService } from '../authorization/authorization.service';

type SearchRow = {
  document_id: string;
  display_name: string;
  repository_id: string;
  folder_id: string | null;
  snippet: string | null;
  content_match: boolean;
  name_match: boolean;
  rank: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME_MATCH_WEIGHT = 1;

function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
  ) {}

  async query(principal: AuthPrincipal, q: string, repositoryId?: string) {
    if (!(await this.authz.hasCapability(principal, PERMISSIONS.SEARCH_QUERY))) {
      throw forbidden();
    }
    const trimmed = q.trim().slice(0, 256);
    if (trimmed.length < 2) {
      return { items: [] };
    }
    if (repositoryId && !UUID_PATTERN.test(repositoryId)) {
      throw new BadRequestException('repositoryId must be a UUID.');
    }

    const readable = await this.authz.accessScope(principal, PERMISSIONS.DOCUMENTS_READ);
    if (readable !== 'all' && readable.repositoryIds.length === 0 && readable.folderGrants.length === 0) {
      return { items: [] };
    }
    const scope = repositoryId
      ? Prisma.sql`d.repository_id = ${repositoryId}::uuid AND ${this.authz.scopePredicate(readable)}`
      : this.authz.scopePredicate(readable);

    const like = likePattern(trimmed);
    const rows = await this.prisma.client.$queryRaw<SearchRow[]>`
      WITH q AS (SELECT plainto_tsquery('simple', ${trimmed}) AS tsq),
      matches AS (
        SELECT DISTINCT ON (d.id)
          d.id AS document_id,
          d.display_name,
          d.repository_id,
          d.folder_id,
          d.updated_at,
          (sc.text_content IS NOT NULL AND to_tsvector('simple', sc.text_content) @@ q.tsq) AS content_match,
          (d.display_name ILIKE ${like}) AS name_match,
          sc.text_content,
          COALESCE(ts_rank(to_tsvector('simple', sc.text_content), q.tsq), 0) AS content_rank
        FROM documents d
        CROSS JOIN q
        LEFT JOIN search_chunks sc ON sc.document_version_id = d.current_version_id
        WHERE d.lifecycle_state = 'active'
          AND ${scope}
          AND (
            d.display_name ILIKE ${like}
            OR (sc.text_content IS NOT NULL AND to_tsvector('simple', sc.text_content) @@ q.tsq)
          )
        ORDER BY d.id, content_rank DESC
      )
      SELECT
        m.document_id,
        m.display_name,
        m.repository_id,
        m.folder_id,
        m.content_match,
        m.name_match,
        CASE WHEN m.content_match THEN ts_headline('simple', m.text_content, q.tsq) END AS snippet,
        (m.content_rank + CASE WHEN m.name_match THEN ${NAME_MATCH_WEIGHT} ELSE 0 END)::float8 AS rank
      FROM matches m
      CROSS JOIN q
      ORDER BY rank DESC, m.updated_at DESC
      LIMIT 25
    `;

    return {
      items: rows.map((row) => ({
        documentId: row.document_id,
        displayName: row.display_name,
        repositoryId: row.repository_id,
        folderId: row.folder_id,
        snippet: row.snippet,
        matchedOn: [...(row.name_match ? ['name'] : []), ...(row.content_match ? ['content'] : [])],
        rank: row.rank,
      })),
    };
  }
}
