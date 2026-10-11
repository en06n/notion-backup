// バックアップ用データの型定義

import type { notion } from "./notion.js";

// SDK の型定義から必要な情報を取り出してNotionBlockの型を出す
export type NotionBlock =
    Awaited<ReturnType<typeof notion.blocks.children.list>>["results"][number];
/* 処理ごとの型の変化
list : Promise<ListBlockChildrenResponse> -> 
Awaited : ListBlockChildrenResponse ->
["result"] : Array<PartialBlockObjectResponse | BlockObjectResponse> -> 
[number] : PartialBlockObjectResponse | BlockObjectResponse
*/

// 1つのブロックとその子ブロック
export type SnapshotBlock = {
    block: NotionBlock;
    children?: SnapshotBlock[];
    assetPath?: string;
};

// ページの識別情報
export type SnapshotPage = {
    id: string;
    title: string;
    parent: {
        type: "data_source_id";
        dataSourceId: string;
        databaseId: string;
    };
    properties: Record<string, unknown>;
};

// バックアップ全体
export type Snapshot = {
    version: number;
    page: SnapshotPage;
    backedUpAt: string;
    blocks: SnapshotBlock[];
};


// restore.ts 用の型定義
export type AppendBlock =
    Parameters<typeof notion.blocks.children.append>[0]["children"][number];