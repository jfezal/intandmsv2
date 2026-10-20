import { Injectable } from '@nestjs/common';
import { PERMISSIONS } from '@intandms/core';
import { forbidden } from '../../common/forbidden.exception';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthPrincipal } from '../authorization/authorization.service';
import { AuthorizationService } from '../authorization/authorization.service';

type SearchRow = {
  document_id: string;
  display_name: string;
  repository_id: string;
  snippet: string;
  rank: number;
};

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
  ) {}

  async query(principal: AuthPrincipal, q: string, repositoryId?: string) {
    if (!this.authz.hasPermission(principal, PERMISSIONS.SEARCH_QUERY)) {
      throw forbidden();
    }
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      return { items: [] as Array<Record<string, unknown>> };
    }

    const rows = repositoryId
      ? await this.prisma.client.$queryRaw<SearchRow[]>`
          SELECT
            d.id AS document_id,
            d.display_name,
            d.repository_id,
            ts_headline('simple', sc.text_content, plainto_tsquery('simple', ${trimmed})) AS snippet,
            ts_rank(to_tsvector('simple', sc.text_content), plainto_tsquery('simple', ${trimmed})) AS rank
          FROM search_chunks sc
          INNER JOIN document_versions dv ON dv.id = sc.document_version_id
          INNER JOIN documents d ON d.id = dv.document_id
          WHERE d.repository_id = ${repositoryId}::uuid
            AND to_tsvector('simple', sc.text_content) @@ plainto_tsquery('simple', ${trimmed})
          ORDER BY rank DESC
          LIMIT 25
        `
      : await this.prisma.client.$queryRaw<SearchRow[]>`
          SELECT
            d.id AS document_id,
            d.display_name,
            d.repository_id,
            ts_headline('simple', sc.text_content, plainto_tsquery('simple', ${trimmed})) AS snippet,
            ts_rank(to_tsvector('simple', sc.text_content), plainto_tsquery('simple', ${trimmed})) AS rank
          FROM search_chunks sc
          INNER JOIN document_versions dv ON dv.id = sc.document_version_id
          INNER JOIN documents d ON d.id = dv.document_id
          WHERE to_tsvector('simple', sc.text_content) @@ plainto_tsquery('simple', ${trimmed})
          ORDER BY rank DESC
          LIMIT 25
        `;

    return {
      items: rows.map((row) => ({
        documentId: row.document_id,
        displayName: row.display_name,
        repositoryId: row.repository_id,
        snippet: row.snippet,
        rank: row.rank,
      })),
    };
  }
}
