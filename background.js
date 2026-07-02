chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "CHECK_CITATION") {
    const { doi, title } = request.data;
    
    // 二段階の非同期チェックをキック
    validateCitation(doi, title).then(result => {
      sendResponse(result);
    });
    
    return true; // 非同期レスポンスを維持するために必要
  }
});

async function validateCitation(doi, title) {
  // マナーとしてUser-Agent（またはメールアドレス）をヘッダーに添える（学術APIの推奨ルール）
  const headers = { "User-Agent": "AcademicTruthExtension/1.0 (mailto:your-email@example.com)" };

  try {
    // 【第1段階】Crossref API で DOI の実在性とメタデータをチェック
    const crossrefUrl = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
    const res = await fetch(crossrefUrl, { headers });
    
    if (res.status === 200) {
      const json = await res.json();
      const realTitle = json.message?.title?.[0] || "";
      
      // タイトルの類似度チェック (簡易判定: 主要キーワードが含まれているか)
      if (title && realTitle) {
        const cleanWords = title.toLowerCase().match(/\b\w{4,}\b/g) || [];
        const matchCount = cleanWords.filter(word => realTitle.toLowerCase().includes(word)).length;
        
        // 50%以上のキーワードが一致すればGREEN、それ以外は部分捏造（フランケン）
        if (cleanWords.length === 0 || (matchCount / cleanWords.length) >= 0.5) {
          return { status: "GREEN", reason: "DOI exists and title matches standard records." };
        } else {
          // フランケン文献（実在DOI＋嘘タイトル）の場合、本物の情報をサジェスト
          return { 
            status: "YELLOW", 
            reason: "DOI exists, but title does NOT match. Potential Frankenstein reference.",
            suggestion: {
              title: realTitle,
              author: json.message?.author?.[0]?.family || "Unknown",
              year: json.message?.created?.["date-parts"]?.[0]?.[0] || "N/A"
            }
          };
        }
      }
      return { status: "GREEN", reason: "DOI validated successfully." };
    }
  } catch (e) {
    console.error("Crossref connection failed, switching fallback.", e);
  }

  // 【第2段階】DOIが存在しない（RED）場合、Semantic Scholar で本当の文献を検索
  if (title) {
    try {
      const s2Url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(title)}&limit=1`;
      const s2Res = await fetch(s2Url);
      if (s2Res.status === 200) {
        const s2Json = await s2Res.json();
        if (s2Json.data && s2Json.data.length > 0) {
          const suggestedPaper = s2Json.data[0];
          return {
            status: "RED",
            reason: "DOI not found. Found a highly relevant real paper instead.",
            suggestion: {
              title: suggestedPaper.title,
              author: "Verified Academic Source",
              year: suggestedPaper.year || "N/A",
              doi: suggestedPaper.externalIds?.DOI || null
            }
          };
        }
      }
    } catch (e) {
      console.error("Semantic Scholar search failed.", e);
    }
  }

  return { status: "RED", reason: "Completely fabricated reference. No database records found." };
}
