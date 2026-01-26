## 手順

- OpenSearchのドメインを作成
- Bedrockとのコネクタを作成
- コネクタを使うモデルを作成（登録）
- インデックスを作成
- ベクトル検索（ダッシュボード）
- CFテンプレートでコネクタ・モデルを作成
- Next.jsからベクトル検索
- OpenSearchのドメインを削除

## OpenSearchのドメインを作成

### 名前

- ドメイン名
  - aozora-vector

### ドメイン作成方法

- ドメイン作成方法
  - 標準作成

### テンプレート

- テンプレート
  - 開発/テスト

### デプロイオプション

- デプロイオプション
  - スタンバイなしのドメイン
- アベイラビリティーゾーン
  - 1-AZ（何個の AZ に配置するか）

### エンジンのオプション

- バージョン
 - 3.3(最新) - recommended
 
※ 2026.1.17時点。その時々で最新を選べばOK

### データノードの数

- インスタンスファミリー
  - 汎用
- インスタンスタイプ
  - t3.small.search
- データノードの数
  - 1（最安。ただし負荷分散なし）
- ノードあたりの EBS ストレージサイズ
  - 20

### ネットワーク

- ネットワーク
  - パブリックアクセス

### きめ細かなアクセスコントロール

- マスターユーザー
  - マスターユーザーを作成
- マスターユーザー名
  - `aozoramaster`（任意のもの）
- マスターパスワード
  - `Bluesky123#`（任意のもの）

### アクセスポリシー

- ドメインアクセスポリシー
  - きめ細かなアクセスコントロールのみを使用してください

※ CloudShellから一部操作をしたいため

## Bedrockとのコネクタを作成

### コネクタとは？モデルとは？

※ 別途図解

### IAM Role作成

#### ポリシー作成

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "bedrock:InvokeModel"
            ],
            "Resource": "*"
        }
    ]
}
```

- ポリシー名
  - `OpenSearchBedrockInvokePolicyDev`

#### ロール作成

- カスタム信頼ポリシー

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "es.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

- 許可ポリシー
  - `OpenSearchBedrockInvokePolicyDev`

- ロール名
  - `OpenSearchBedrockInvokeRoleDev`

### CloudShellからコネクターを作るための権限紐付け

CloudShellで下記を実行。ログイン方法によって異なる

- IAMユーザーでログインしてる場合

```
aws sts get-caller-identity --query Arn --output text
```

```
# ルートユーザーの場合
arn:aws:iam::1234567890:root
# IAMユーザーの場合
arn:aws:iam::1234567890:user/yourname
```

- SSOでログインしてる場合

```
ROLE_NAME=$(aws sts get-caller-identity --query Arn --output text | cut -d'/' -f2)
```

続けて下記コマンド

```
aws iam get-role --role-name $ROLE_NAME --query 'Role.Arn' --output text
```

```
# SSOの場合
arn:aws:iam::1234567890:role/aws-reserved/sso.amazonaws.com/ap-northeast-1/AWSReservedSSO_AdministratorAccess_abcd1234
```

- ml_full_accessに上記Arnをセット

```
Security → Roles → ml_full_access → Mapped user → Manage mapping
```

上記の設定でコネクター作成に失敗するならば下記にもArnをセット

```
Security → Roles → all_access → Mapped user → Manage mapping
```

### awscurlのインストール

CloudShellにawscurlが入ってるか確認

```
which awscurl
```

awscurlをインストール

```
pip3 install awscurl
```

パスを通す（コマンドが見つからない場合）

```
export PATH=$PATH:$HOME/.local/bin
```

※ インストール方法

https://github.com/okigan/awscurl

### コネクター作成

```
awscurl --service es \
  --region ap-northeast-1 \
  -X POST \
  "①OpenSearchのドメイン/_plugins/_ml/connectors/_create" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "BEDROCK_TITAN_TEXT_EMBED_V2",
    "description": "Amazon Titan Text Embeddings v2 via Amazon Bedrock",
    "version": 1,
    "protocol": "aws_sigv4",
    "credential": {
      "roleArn": "②作成したIAMロールのARN"
    },
    "parameters": {
      "region": "ap-northeast-1",
      "service_name": "bedrock",
      "model": "amazon.titan-embed-text-v2:0",
      "dimensions": 1024,
      "normalize": true,
      "embeddingTypes": ["float"]
    },
    "actions": [
      {
        "action_type": "predict",
        "method": "POST",
        "url": "https://bedrock-runtime.${parameters.region}.amazonaws.com/model/${parameters.model}/invoke",
        "headers": {
          "content-type": "application/json",
          "x-amz-content-sha256": "required"
        },
        "request_body": "{ \"inputText\": \"${parameters.inputText}\", \"dimensions\": ${parameters.dimensions}, \"normalize\": ${parameters.normalize}, \"embeddingTypes\": ${parameters.embeddingTypes} }",
        "pre_process_function": "connector.pre_process.bedrock.embedding",
        "post_process_function": "connector.post_process.bedrock.embedding"
      }
    ]
  }'
```

## コネクタを使うモデルを作成（登録）

### モデルを作成（登録）

生成AIのモデルでは無い点に注意

```
POST /_plugins/_ml/models/_register?deploy=true
{
  "name": "titan-embed-text-v2",
  "function_name": "remote",
  "description": "Amazon Titan Text Embeddings v2 via Bedrock connector",
  "connector_id": "コネクタID"
}
```

### モデルの登録を確認

```
GET /_plugins/_ml/models/モデルID
```

### Bedrock連携を確認

テキストのEmbeddingが返って来ることを確認

```
POST /_plugins/_ml/_predict/text_embedding/モデルID
{
  "text_docs": ["恋がしたい"]
}
```

### パイプラインを作成

データ保存時に自動でBedrockを使いEmbeddingを作成。`summary`フィールドを元にEmbeddingを作成して`summary_vector`に保存

```
PUT /_ingest/pipeline/aozora-embed-pipeline
{
  "description": "generate embedding with Titan v2",
  "processors": [
    {
      "text_embedding": {
        "model_id": "モデルID",
        "field_map": {
          "summary": "summary_vector"
        }
      }
    }
  ]
}
```

## インデックス作成

### インデックス作成

```
PUT /aozora_vector
{
  "settings": {
    "index.knn": true,
    "default_pipeline": "aozora-embed-pipeline",
    "analysis": {
      "char_filter": {
        "nfkc_cf": {
          "type": "icu_normalizer",
          "name": "nfkc_cf"
        }
      },
      "tokenizer": {
        "my_kuromoji_tokenizer": {
          "type": "kuromoji_tokenizer"
        }
      },
      "analyzer": {
        "my_kuromoji_analyzer": {
          "type": "custom",
          "char_filter": ["nfkc_cf"],
          "tokenizer": "my_kuromoji_tokenizer",
          "filter": [
            "kuromoji_number",
            "kuromoji_baseform",
            "kuromoji_part_of_speech",
            "ja_stop",
            "kuromoji_stemmer",
            "lowercase"
          ]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "title": {
        "type": "text",
        "analyzer": "my_kuromoji_analyzer"
      },
      "summary": {
        "type": "text",
        "analyzer": "my_kuromoji_analyzer"
      },
      "author": { "type": "keyword" },
      "summary_vector": {
        "type": "knn_vector",
        "dimension": 1024
      }
    }
  }
}
```

ベクトル検索の設定

- settings.index.knn
- settings.default_pipeline
- mappings.properties.summary_vector

レキシカル検索の設定

- settings.analysis.char_filter
- settings.analysis.tokenizer
- settings.analysis.analyzer
- mappings.properties.title
- mappings.properties.summary
- mappings.properties.author

## ベクトル検索（ダッシュボード）

### データ保存

```
POST /_bulk
{ "index": { "_index": "aozora_vector", "_id": "1" } }
{ "title": "小説総論", "author": "二葉亭四迷", "summary": "『小説総論』は、小説の本質や批評の方法について論じた作品であり、著者は小説を理解するためにはまずその本義を知る必要があると主張しています。作品は、形と意の関係を探求し、物事の存在やその意味を考察することで、文学の深い理解を促します。\n\n著者は、形（物）と意（思想）の相互作用を強調し、形は意を表現する手段であると述べます。物質的な形は意を持たず、意は形を通じて表現されるため、どちらが重要かを単純に決めることはできません。意は内面的なものであり、形は外面的なものとして存在するため、形を通じて意を読み取ることが求められます。\n\nまた、著者は小説の二つの側面、すなわち「勧懲」と「摸写」を区別します。勧懲は道徳的な教訓を含む小説であり、著者はこれを軽視し、真の小説は現実を忠実に描写する「摸写」であると主張します。摸写は、現実の現象を通じて自然の情態を直接に感得し、それを読者に伝えることが目的です。\n\nさらに、著者は小説における「意」の重要性を強調し、意を形にすることが小説の真髄であると述べます。小説は単なる現象の描写ではなく、その背後にある意を明確に表現することが求められます。形を写すだけではなく、その意をも写し出すことが、優れた小説の条件であるとしています。\n\n最後に、著者は小説の批評において、意と形の発達を論理的に考察し、事実に基づいて評価することが重要であると述べます。小説の真価を見極めるためには、形と意の両方を理解し、それらがどのように結びついているかを考えることが必要です。\n\nこのように『小説総論』は、小説の本質を探求し、文学の理解を深めるための重要な視点を提供しています。著者は、文学の批評においては、単なる表面的な評価ではなく、深い洞察が求められることを強調しています。" }
{ "index": { "_index": "aozora_vector", "_id": "2" } }
{ "title": "ボヘミアの醜聞", "author": "アーサー・コナン・ドイル　Arthur Conan Doyle", "summary": "『ボヘミアの醜聞』は、アーサー・コナン・ドイルによるシャーロック・ホームズの短編小説で、ホームズと彼の友人ワトソン博士の関係を描きつつ、ボヘミア王室に関わるスキャンダルを解決する物語です。\n\n物語は、ホームズがアイリーン・アドラーという女性に特別な感情を抱いていることから始まります。彼は彼女を「かの女」と呼び、他の女性とは異なる存在として認識しています。ワトソンは結婚し、ホームズとは疎遠になっていましたが、ある晩、彼はホームズを訪ねることにします。ホームズは新たな依頼を受けており、その依頼人はボヘミアの王、ヴィルヘルム・ゴッツライヒ・ジギースモーント・フォン・オルムシュタインです。\n\n王は、アイリーン・アドラーと過去に親密な関係を持ち、彼女が持っている不名誉な写真を取り戻したいと考えています。この写真は、王が他の女性と結婚する際に脅迫材料として使われる可能性があるため、王室の名誉を守るために必要です。ホームズはこの依頼を引き受け、アイリーンの居所を調査することになります。\n\nホームズは変装してアイリーンの家を調査し、彼女の生活や彼女が関わる男性、ゴドフリィ・ノートンについて情報を集めます。彼はアイリーンが写真をどこに隠しているのかを突き止めるために、様々な策略を巡らせます。最終的に、ホームズはアイリーンの家で火事を装い、彼女が写真を取りに行く瞬間を狙います。\n\nしかし、アイリーンはホームズの計画を見抜き、彼を出し抜いて逃げてしまいます。彼女は結婚を決め、王室に対しても自分の立場を守るための手紙を残します。手紙には、彼女が写真を持っていること、そしてそれを王に脅迫材料として使うつもりはないことが記されています。アイリーンは新たな生活を始めるためにイギリスを離れ、ホームズは彼女の機知に感心し、彼女を「かの女」として特別に敬意を表します。\n\nこの物語は、ホームズが女性に対して持つ特別な感情や、彼の推理力が一人の女性によって打ち破られる様子を描いており、女性の知恵や強さを称賛する内容になっています。また、ホームズの冷徹な観察力と推理が、感情や人間関係の複雑さに対して無力であることを示しています。最終的に、アイリーンは自らの幸せを選び、王室の名誉を守るために行動します。" }
{ "index": { "_index": "aozora_vector", "_id": "3" } }
{ "title": "夏秋表", "author": "立原道造", "summary": "『夏秋表』は、作者が自然と虫、花との交感を通じて、季節の移ろいと自己の内面を探求する作品です。\n\n第一部では、主人公が信濃路の山荘で、春蝉と草ひばりという二つの虫の声に触れます。春蝉は短い命を持ち、夏の間は忘れ去られてしまいますが、秋の訪れと共に再び草ひばりの声を聞くことで、春蝉の存在を思い出します。草ひばりの声は、精巧な楽器のように美しく、主人公はその音色に心を奪われます。しかし、草ひばりが籠から逃げ出した後、主人公はその虫の声が失われたことに対する虚しさを感じ、自然の中での虫たちの命の儚さを思い知らされます。\n\n第二部では、主人公が「ゆうすげ」という花について語ります。彼はこの花を田中一三に教えたことを思い出し、その花の美しさと儚さを称賛します。しかし、夏の終わりに紀の国を訪れた際、杉浦明平から教えられたゆうすげの花は、彼が知っていたものとは異なり、みすぼらしい姿をしていました。この対比を通じて、主人公は自分の記憶と現実のギャップに苦しみ、二つの異なるゆうすげのイメージが互いに対立し、最終的にはどちらかが消えてしまう運命にあることを示唆します。\n\n全体を通じて、主人公は自然の中での小さな命との交感を通じて、自身の感情や記憶を掘り下げ、季節の移り変わりがもたらす感傷を描写しています。この作品は、自然との関わりを通じて人間の内面的な葛藤や孤独を浮き彫りにし、深い感慨を与えるものとなっています。" }
```

### Embedding生成されたか確認

```
GET /aozora_vector/_search
{
  "query": {
    "match_all": {}
  }
}
```

### 検索パターン１（neural）

自動でクエリのEmbeddingを作成・検索。必ずEmbedding生成が走る

```
GET /aozora_vector/_search
{
  "size": 1,
  "_source": ["title", "author", "summary"],
  "query": {
    "neural": {
      "summary_vector": {
        "query_text": "探偵が事件を推理して解決する物語",
        "model_id": "モデルID",
        "k": 3
      }
    }
  }
}
```

### 検索パターン２（predict + knn）

Embeddingの作成・検索をそれぞれ行う。Embeddingをキャッシュしたい場合など

```
POST /_plugins/_ml/_predict/text_embedding/モデルID
{
  "text_docs": ["探偵が事件を推理して解決する物語"]
}
```

ベクトル検索

```
POST /aozora_vector/_search
{
  "size": 1,
  "_source": ["title", "author", "summary"],
  "query": {
    "knn": {
      "summary_vector": {
        "vector":  [ 上記作成された配列 ],
        "k": 3
      }
    }
  }
}
```

## AWSがコネクタ・モデルを作るCFテンプレートを使ってみる

IAMロール・コネクタ・モデル作成をボタンをポチポチするだけで作れる

```
Integrations
↓
Amazon Bedrock を通じて Amazon Titan Text Embeddings モデルと統合する 
↓
パブリックドメインを設定
```

「Lambda Invoke OpenSearch ML Commons Role Name」にあるRoleのARNを調べて下記にペースト

```
Security → Roles → ml_full_access → Mapped user → Manage mapping
```

次の3つを指定して「スタック作成」

- Amazon OpenSearch Endpoint
- Model
- Model Region

スタックが作成されたら「出力」タブで以下をメモする

- ConnectorId
- ModelId

以後「Bedrock連携を確認」から作業

## Next.jsのアプリでベクトル検索

### プログラムでデータ投入

環境変数をセット

```
OPENSEARCH_URL=
OPENSEARCH_MODEL=
OPENSEARCH_INDEX=aozora_vector
OPENSEARCH_USERNAME=aozoramaster
OPENSEARCH_PASSWORD="Bluesky123#"
```

Nodeモジュールのインストール

```
npm install
```

データのアップロードプログラムを実行

```
npm run upload-data
```

データ件数を確認

```
GET /aozora_vector/_count
```

ベクトル検索

```
GET /aozora_vector/_search
{
  "size": 3,
  "_source": ["title", "author", "summary"],
  "query": {
    "neural": {
      "summary_vector": {
        "query_text": "探偵が事件を推理して解決する物語",
        "model_id": "モデルID",
        "k": 5
      }
    }
  }
}
```

## Next.jsアプリから検索

### 検索を試す

```
npm run dev
```

- レキシカル検索（キーワード検索）
- ベクトル検索
- ハイブリット検索

### ハイブリッド検索の検索結果を調整

レキシカル検索の一致が優先されがち問題

```
PUT /_search/pipeline/hybrid-search-pipeline
{
  "description": "Post-processor for hybrid search",
  "phase_results_processors": [
    {
      "normalization-processor": {
        "normalization": { "technique": "min_max" },
        "combination": { "technique": "arithmetic_mean" }
      }
    }
  ]
}
```

## ベクトルキャッシュをどのようにするか

ベクトル検索・ハイブリッド検索ともにロジックを次のように変更

```
検索ボタン
↓
RedisやDynamoDBにその検索ワードのベクトルが無いか確認
↓
ある：ベクトルを取得
ない：ベクトルを作るリクエスト・ベクトルをRedisやDynamoDBに保存
↓
ベクトルを使って検索
```
