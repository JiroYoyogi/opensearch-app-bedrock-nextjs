"use client";

import { useState } from "react";
import { searchAozora, SearchType, SearchResult } from "@/actions/search";

type Status = "idle" | "searching" | "success" | "error";

export default function Home() {
  const [userText, setUserText] = useState("");
  const [searchType, setSearchType] = useState<SearchType>("lexical");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("searching");
    setResults([]);
    setErrorMessage("");
    try {
      const data = await searchAozora(userText, searchType);
      setStatus("success");
      setResults(data);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Unknown error");
    }
  };

  return (
    <main className="font-sans min-h-screen w-3xl mx-auto py-10">
      <h1 className="text-3xl font-bold mb-8 text-center">青空文庫 全文検索</h1>

      {/* フォーム */}
      <form onSubmit={handleSearch} className="flex flex-col gap-4 mb-8">
        <input
          type="text"
          value={userText}
          onChange={(e) => setUserText(e.target.value)}
          placeholder="キーワードや文章を入力してください（例：小説、探偵が事件を推理して解決する物語）"
          className="flex-1 p-3 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-black bg-white"
        />
        <div className="flex gap-6 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="searchType"
              value="lexical"
              checked={searchType === "lexical"}
              onChange={(e) => setSearchType(e.target.value as SearchType)}
            />
            レキシカル検索（キーワード検索）
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="searchType"
              value="vector"
              checked={searchType === "vector"}
              onChange={(e) => setSearchType(e.target.value as SearchType)}
            />
            ベクトル検索
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="searchType"
              value="hybrid"
              checked={searchType === "hybrid"}
              onChange={(e) => setSearchType(e.target.value as SearchType)}
            />
            ハイブリッド検索
          </label>
        </div>

      <button
        type="submit"
        disabled={status === "searching"}
        className="
          bg-blue-600 text-white px-6 py-3 rounded-lg font-bold
          cursor-pointer hover:bg-blue-700
          disabled:bg-blue-400 disabled:cursor-not-allowed
          transition
        "
      >
          {status === "searching" ? "検索中 ..." : "検索"}
        </button>
      </form>

      {status === "error" && (
        <p className="text-center">
          <span>
            エラーが発生しました。もう一度お試しください。
            <br />
            <span className="font-bold text-sm text-gray-700">
              {errorMessage}
            </span>
          </span>
        </p>
      )}

      {status === "success" && (
        <div>
          <p>{results.length}件の作品が見つかりました。</p>
          <ul>
            {results.map((res, key) => (
              <li
                key={key}
                className="p-6 border rounded-xl shadow-sm bg-white mt-4 relative"
              >
                <div className="absolute top-4 right-4 bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-md border">
                  Score: {res.score.toFixed(3)}
                </div>
                <h2 className="text-xl font-bold text-blue-800 mb-2">
                  {res.title}
                </h2>
                {/* 
                    Q. なぜ、dangerouslySetInnerHTML？
                    A. レスポンス中の <em> タグを有効にしたいため
                */}
                <p
                  className="text-gray-700 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: res.highlight }}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
