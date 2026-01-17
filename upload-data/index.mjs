import fs from "node:fs";
import path from "node:path";
import { Client } from "@opensearch-project/opensearch";
import dotenv from "dotenv";

dotenv.config();

const OPENSEARCH_URL = process.env.OPENSEARCH_URL ?? "";
const OPENSEARCH_INDEX = process.env.OPENSEARCH_INDEX ?? "";
const USERNAME = process.env.OPENSEARCH_USERNAME ?? "";
const PASSWORD = process.env.OPENSEARCH_PASSWORD ?? "";
const DATA_DIR = "./upload-data/data";

const client = new Client({
  node: OPENSEARCH_URL,
  auth: {
    username: USERNAME,
    password: PASSWORD
  },
  ssl: {
    // Docker版のOpenSearchを使う場合 false にすることが多いので合わせてる
    rejectUnauthorized: false 
  }
});

(async () => {
  try {
    const jsonList = fs
      .readdirSync(DATA_DIR)
      .filter((f) => path.extname(f).toLowerCase() === ".json");

    if (jsonList.length === 0) {
      throw new Error(`No json files found in directory: ${DATA_DIR}`);
    }

    const dataToUpload = [];

    for (const fileName of jsonList) {
      const filePath = path.join(DATA_DIR, fileName);
      const content = JSON.parse(fs.readFileSync(filePath, "utf8"));

      // [ {指示}, {データ}, {指示}, {データ} ... ]
      dataToUpload.push({ index: { _index: OPENSEARCH_INDEX, _id: content.index } });
      dataToUpload.push({
        title: content.title,
        summary: content.summary,
        author: content.author
      });

    } // for

    // 20件ずつ保存。件数が多いとモデル（Bedrockの窓口）呼び出しの上限（デフォルトで30）に引っかかる
    const CHUNK_SIZE = 20;
    console.log(`Starting bulk upload: Total ${jsonList.length} documents...`)

    for (let i = 0; i < dataToUpload.length; i += CHUNK_SIZE * 2) {
      const chunk = dataToUpload.slice(i, i + CHUNK_SIZE * 2);

      const response = await client.bulk({ 
        body: chunk,
        refresh: i + CHUNK_SIZE * 2 >= dataToUpload.length,
      });

      const bulkResponse = response.body ? response.body : response;

      if (bulkResponse.errors) {
        const erroredItems = bulkResponse.items.filter(item => item.index && item.index.error);
        console.error('Failed items:', JSON.stringify(erroredItems, null, 2));
      }
    }
    
    console.log(`Done. All batches processed.`);

  } catch (err) {
    console.error(err);
    process.exit(1);
  }

})();
