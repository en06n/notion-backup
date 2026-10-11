
import { notion } from "./notion.js";
import type { NotionBlock, SnapshotBlock, Snapshot } from "./types.js";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type RetrievedPage = Awaited<
    ReturnType<typeof notion.pages.retrieve>
>;

const pageId = process.env.NOTION_PAGE_ID;

if (!pageId) {
    throw new Error("NOTION_PAGE_ID is not set");
}

// ページネーションを使って、子ブロックをすべて取得する
async function getAllChildBlocks(
    blockId: string
): Promise<NotionBlock[]> {
    const notionBlocks: NotionBlock[] = [];

    let response = await notion.blocks.children.list({
        block_id: blockId,
    });

    notionBlocks.push(...response.results);

    while (response.has_more) {
        if (!response.next_cursor) {
            throw new Error("Missing next_cursor");
        }

        response = await notion.blocks.children.list({
            block_id: blockId,
            start_cursor: response.next_cursor,
        });

        notionBlocks.push(...response.results);
    }

    return notionBlocks;
}

// Content-Typeから拡張子を決める
function getImageExtension(
    contentType: string | null,
    url: string
): string {
    const extensions: Record<string, string> = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "image/webp": ".webp",
        "image/svg+xml": ".svg",
        "image/avif": ".avif",
        "image/bmp": ".bmp",
        "image/tiff": ".tiff",
    };

    const mimeType = contentType
        ?.split(";")[0]
        .trim()
        .toLowerCase();

    if (mimeType && extensions[mimeType]) {
        return extensions[mimeType];
    }

    // Content-Typeで判断できない場合はURLの拡張子を使う
    const urlExtension = extname(new URL(url).pathname)
        .toLowerCase();

    // 不明な拡張子をそのまま採用しない
    const allowedExtensions = new Set(
        Object.values(extensions)
    );

    if (allowedExtensions.has(urlExtension)) {
        return urlExtension;
    }

    throw new Error(
        `画像の拡張子を判定できませんでした: ${url}`
    );
}

// Notionホストの画像をassetsディレクトリに保存する
async function saveImageAsset(
    block: NotionBlock,
    assetsDir: string
): Promise<string | undefined> {
    if (!("type" in block)) {
        throw new Error(
            "ブロックの詳細情報が不足しているため、保存できません"
        );
    }

    // 画像ブロック以外は対象外
    if (block.type !== "image") {
        return undefined;
    }

    // 外部URLの画像は今回は対象外
    if (block.image.type !== "file") {
        return undefined;
    }

    const imageUrl = block.image.file.url;

    // 画像をダウンロードする
    const response = await fetch(imageUrl);

    if (!response.ok) {
        throw new Error(
            `画像のダウンロードに失敗しました: ` +
            `${block.id} (HTTP ${response.status})`
        );
    }

    // Content-Typeから画像の拡張子を取得する
    const extension = getImageExtension(
        response.headers.get("content-type"),
        imageUrl
    );

    // ブロックIDをファイル名に使う
    const fileName = `${block.id}${extension}`;
    const assetPath = `assets/${fileName}`;
    const absolutePath = resolve(assetsDir, fileName);

    // 画像データをバイナリとして保存する
    const imageData = Buffer.from(
        await response.arrayBuffer()
    );

    await writeFile(absolutePath, imageData);

    console.log(`画像を保存しました: ${assetPath}`);

    return assetPath;
}

// 子ブロックを再帰的に取得して、画像も保存する
async function getChildren(
    blockId: string,
    assetsDir: string
): Promise<SnapshotBlock[]> {
    const blocks = await getAllChildBlocks(blockId);
    const snapshots: SnapshotBlock[] = [];

    for (const block of blocks) {
        // 画像ならファイルを保存する
        const assetPath = await saveImageAsset(
            block,
            assetsDir
        );

        const snapshot: SnapshotBlock = {
            block,
            ...(assetPath ? { assetPath } : {}),
        };

        if ("has_children" in block && block.has_children) {
            snapshot.children = await getChildren(
                block.id,
                assetsDir
            );
        }

        snapshots.push(snapshot);
    }

    return snapshots;
}

// 取得したデータをJSONファイルとして保存する
async function saveSnapshot(
    snapshot: Snapshot,
    snapshotDir: string
): Promise<void> {
    const jsonSnapshot = JSON.stringify(
        snapshot,
        null,
        2
    );

    await writeFile(
        resolve(snapshotDir, `${snapshot.page.id}.json`),
        jsonSnapshot,
        "utf-8"
    );
}

// Notionのページ情報からタイトルと親情報を取得する
function getSnapshotPageInfo(page: RetrievedPage) {
    if (!("properties" in page)) {
        throw new Error("Page properties not found");
    }

    const titleProperty = Object.values(page.properties).find(
        (property) => property.type === "title"
    );

    if (!titleProperty || titleProperty.type !== "title") {
        throw new Error("Page title not found");
    }

    const title = titleProperty.title
        .map((item) => item.plain_text)
        .join("");

    if (page.parent.type !== "data_source_id") {
        throw new Error(
            "This backup currently supports data-source pages only"
        );
    }

    const parent = {
        type: "data_source_id" as const,
        dataSourceId: page.parent.data_source_id,
        databaseId: page.parent.database_id,
    };

    return {
        title,
        parent,
        properties: page.properties,
    };
}

// メイン処理
// 1. バックアップ先ディレクトリを作成する
const backedUpAt = new Date().toISOString();
const timestamp = backedUpAt.replace(/[:.]/g, "-");

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFilePath);
const snapshotRoot = resolve(currentDir, "../snapshots");
const snapshotDir = resolve(snapshotRoot, timestamp);
const assetsDir = resolve(snapshotDir, "assets");

await mkdir(assetsDir, { recursive: true });

// 2. ページ情報を取得する
const page = await notion.pages.retrieve({
    page_id: pageId,
});

const pageInfo = getSnapshotPageInfo(page);

// 3. ブロックを取得し、画像を保存する
const blocks = await getChildren(pageId, assetsDir);

// 4. Snapshotを作成する
const snapshot: Snapshot = {
    version: 1,
    page: {
        id: pageId,
        title: pageInfo.title,
        parent: pageInfo.parent,
        properties: pageInfo.properties,
    },
    backedUpAt,
    blocks,
};

// 5. JSONとして保存する
await saveSnapshot(snapshot, snapshotDir);

// 6. ログを出す
console.log(`バックアップ先: ${snapshotDir}`);
console.dir(snapshot, { depth: null });
