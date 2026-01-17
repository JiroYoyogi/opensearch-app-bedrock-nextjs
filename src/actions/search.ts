"use server";

import { Client } from "@opensearch-project/opensearch";
type SearchRequest = Parameters<InstanceType<typeof Client>["search"]>[0];

const OPENSEARCH_URL = process.env.OPENSEARCH_URL || "";
const OPENSEARCH_INDEX = process.env.OPENSEARCH_INDEX || "";
const OPENSEARCH_MODEL = process.env.OPENSEARCH_MODEL || "";
const USERNAME = process.env.OPENSEARCH_USERNAME || "";
const PASSWORD = process.env.OPENSEARCH_PASSWORD || "";

const OPENSEARCH_SEARCH_PIPELINE = "";

// OpenSearchクライアント
const osClient = new Client({
  node: OPENSEARCH_URL,
  auth: {
    username: USERNAME,
    password: PASSWORD,
  },
});

interface AozoraHit {
  _id: string;
  _score: number | null;
  _source: {
    title: string;
    summary: string;
    author: string;
  };
  highlight?: {
    [key: string]: string[];
  };
}

export type SearchType = "lexical" | "vector" | "hybrid";

export interface SearchResult {
  id: string;
  title: string;
  summary: string;
  highlight: string; // ハイライトされたテキスト
  score: number; // スコア
}

export async function searchAozora(
  userText: string,
  searchType: SearchType,
): Promise<SearchResult[]> {
  if (!userText) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const searchParams: any = {
    index: OPENSEARCH_INDEX,
    body: getSearchBody(userText, searchType),
  };

  if (searchType === "hybrid" && OPENSEARCH_SEARCH_PIPELINE) {
    searchParams.search_pipeline = OPENSEARCH_SEARCH_PIPELINE;
  }

  try {
    const response = await osClient.search(searchParams as SearchRequest);

    const hits = response.body.hits.hits as unknown as AozoraHit[];

    return hits.map((hit) => {
      const sourceSummary = hit._source?.summary ?? "";
      const displayHighlight =
        hit.highlight?.summary?.[0] ??
        (sourceSummary.length > 150
          ? sourceSummary.substring(0, 150) + "..."
          : sourceSummary);
      return {
        id: String(hit._id),
        title: hit._source?.title ?? "No Title",
        summary: hit._source?.summary ?? "",
        highlight: displayHighlight,
        score: hit._score ?? 0,
      };
    });
  } catch (error) {
    console.error("OpenSearch Error:", error);
    throw new Error("検索中にエラーが発生しました");
  }
}

function getSearchBody(userText: string, searchType: SearchType) {
  const highlightSettings = {
    fields: { summary: {} },
    pre_tags: ['<em class="bg-yellow-200 not-italic font-bold">'],
    post_tags: ["</em>"],
  };

  switch (searchType) {
    case "lexical":
      return {
        size: 5,
        query: {
          // match ... title だけ summary だけから探す
          // multi_match ... title と summary から探す
          multi_match: {
            query: userText,
            fields: ["title", "summary"],
            type: "most_fields",
            // or ... 飲食店で検索「飲食」または「店」のどちらかを含む
            // and ... 飲食店で検索「飲食」と「店」のどちらを含む
            operator: "or",
          },
        },
        highlight: highlightSettings,
      };
    case "vector":
      return {
        size: 5,
        query: {
          neural: {
            summary_vector: {
              query_text: userText,
              model_id: OPENSEARCH_MODEL,
              k: 10, // 各保存場所から近いものをk個取得。マージして更にk個に絞る
            },
          },
        },
      };
    case "hybrid":
      return {
        size: 5,
        _source: ["title", "summary", "author"],
        query: {
          hybrid: {
            queries: [
              {
                multi_match: {
                  query: userText,
                  fields: ["title", "summary"],
                },
              },
              {
                neural: {
                  summary_vector: {
                    query_text: userText,
                    model_id: OPENSEARCH_MODEL,
                    k: 20, // 各保存場所から近いものをk個取得。マージして更にk個に絞る
                  },
                },
              },
            ],
          },
        },
        highlight: highlightSettings,
      };
  }
}
