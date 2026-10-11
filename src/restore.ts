import { readFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { notion } from "./notion.js";
import { toAppendBlock } from "./converters.js";
import type { Snapshot, SnapshotBlock } from "./types.js";


// コマンドライン引数
type RestoreOptions = {
    snapshotPath: string;
    mode: "copy" | "replace";
};

// コマンドライン引数を解析する
function parseArgs(args: string[]): RestoreOptions {
    let snapshotPath: string | undefined;
    let mode: "copy" | "replace" | undefined;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--snapshot") {
            snapshotPath = args[++i];
        } else if (args[i] === "--mode") {
            const value = args[++i];

            if (value === "copy" || value === "replace") {
                mode = value;
            }
        }
    }

    if (!snapshotPath || !mode) {
        throw new Error(
            "Usage: npx tsx src/restore.ts " +
            "--snapshot <path> --mode <copy|replace>"
        );
    }

    return { snapshotPath, mode };
}

// バックアップ JSON を読み込む
async function loadSnapshot(
    filePath: string
): Promise<Snapshot> {
    const json = await readFile(filePath, "utf-8");
    const snapshot: Snapshot = JSON.parse(json);

    if (
        !snapshot.page?.id ||
        !snapshot.page?.title ||
        !Array.isArray(snapshot.blocks)
    ) {
        throw new Error("Invalid snapshot file");
    }

    return snapshot;
}

// JSONに保存されたプロパティからタイトルの名前を探す関数
function getTitlePropertyName(
    properties: Record<string, unknown>
): string {
    for (const [name, property] of Object.entries(properties)) {
        if (
            typeof property === "object" &&
            property !== null &&
            "type" in property &&
            property.type === "title"
        ) {
            return name;
        }
    }

    throw new Error("Title property not found in snapshot");
}

// 新しいページを作成する
async function createRestorePage(
    snapshot: Snapshot
): Promise<string> {
    if (snapshot.page.parent.type !== "data_source_id") {
        throw new Error(
            "This restore currently supports data-source pages only"
        );
    }

    const titlePropertyName = getTitlePropertyName(
        snapshot.page.properties
    );

    // Notion API の  Create Page を使って、ページを新しく作成
    const page = await notion.pages.create({
        parent: {
            type: "data_source_id",
            data_source_id: snapshot.page.parent.dataSourceId,
        },
        properties: {
            [titlePropertyName]: {
                title: [
                    {
                        text: {
                            content: `${snapshot.page.title} (復元)`,
                        },
                    },
                ],
            },
        },
    });

    console.log("復元先ページを作成しました:", page.id);

    return page.id;
}

// 画像をアップロードする関数
function getImageContentType(filePath: string): string {
    const extension = extname(filePath).toLowerCase();

    const contentTypes: Record<string, string> = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".avif": "image/avif",
        ".bmp": "image/bmp",
        ".tif": "image/tiff",
        ".tiff": "image/tiff",
    };

    const contentType = contentTypes[extension];

    if (!contentType) {
        throw new Error(
            `未対応の画像形式です: ${extension}`
        );
    }

    return contentType;
}

// ローカル画像をアップロードして、画像ブロックを追加する
async function restoreImage(
    snapshotBlock: SnapshotBlock,
    targetPageId: string,
    snapshotDir: string,
): Promise<void> {
    const block = snapshotBlock.block;

    if (!("type" in block)) {
        throw new Error(
            "ブロックの詳細情報が不足しているため、画像を復元できません"
        );
    }

    if (block.type !== "image") {
        throw new Error("画像ブロックではありません");
    }

    if (!snapshotBlock.assetPath) {
        throw new Error(
            `画像のassetPathがありません: ${block.id}`
        );
    }

    // JSONから画像ファイルのパスを組み立てる
    const assetPath = resolve(
        snapshotDir,
        snapshotBlock.assetPath
    );

    // 画像ファイルを読み込む
    const imageData = await readFile(assetPath);
    const contentType = getImageContentType(assetPath);

    // Notionにアップロード先を作成する
    const upload = await notion.fileUploads.create({
        mode: "single_part",
    });

    // 画像データをアップロードする
    const uploaded = await notion.fileUploads.send({
        file_upload_id: upload.id,
        file: {
            filename: basename(assetPath),
            data: new Blob([imageData], {
                type: contentType,
            }),
        },
    });

    if (uploaded.status !== "uploaded") {
        throw new Error(
            `画像のアップロードが完了していません: ${uploaded.status}`
        );
    }

    // 元の画像ブロックのキャプションを引き継ぐ
    const caption = block.image.caption.map((item) => ({
        type: "text" as const,
        text: {
            content: item.plain_text,
        },
    }));

    // アップロードした画像を復元先に追加する
    await notion.blocks.children.append({
        block_id: targetPageId,
        children: [
            {
                type: "image",
                image: {
                    type: "file_upload",
                    file_upload: {
                        id: uploaded.id,
                    },
                    caption,
                },
            },
        ],
    });

    console.log(`画像を復元しました: ${assetPath}`);
}



// ブロックを復元する
async function restoreBlocks(
    blocks: SnapshotBlock[],
    targetPageId: string,
    snapshotDir: string,
): Promise<void> {
    for (const snapshotBlock of blocks) {
        const block = snapshotBlock.block;

        if (!("type" in block)) {
            continue;
        }

        // もし子ページがあったら、子ページを作る
        if (block.type === "child_page") {
            // 1. 復元先の親ページの下に子ページを作る
            const childPage = await notion.pages.create({
                parent: {
                    type: "page_id",
                    page_id: targetPageId,
                },
                properties: {
                    title: {
                        title: [
                            {
                                text: {
                                    content: block.child_page.title,
                                },
                            },
                        ],
                    },
                },
            });

            // 2. 作成した子ページの中に本文を復元する
            if (snapshotBlock.children?.length) {
                await restoreBlocks(
                    snapshotBlock.children,
                    childPage.id,
                    snapshotDir,
                );
            }

            continue;
        }

        // 画像があればアップロードする
        // ローカルに保存された画像があれば、アップロードして復元する
        if (block.type === "image" && snapshotBlock.assetPath) {
            await restoreImage(
                snapshotBlock,
                targetPageId,
                snapshotDir,
            );

            continue;
        }

        const appendBlock = toAppendBlock(block);
        const response = await notion.blocks.children.append({
            block_id: targetPageId,
            children: [appendBlock],
        });

        const createdBlock = response.results[0];

        if (!createdBlock) {
            throw new Error("ブロックの追加に失敗しました");
        }

        // 子ブロックがあれば再帰する
        if (snapshotBlock.children && snapshotBlock.children.length > 0) {
            await restoreBlocks(snapshotBlock.children, createdBlock.id, snapshotDir);
        }
    }
}

// メイン処理
async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));

    // 1. バックアップを読み込む
    const snapshot = await loadSnapshot(options.snapshotPath);

    console.log("バックアップを読み込みました");
    console.log("ページタイトル:", snapshot.page.title);
    console.log("バックアップ日時:", snapshot.backedUpAt);
    console.log("ブロック数:", snapshot.blocks.length);

    // 2. モードに応じて復元先のページを決める
    let targetPageId: string;

    if (options.mode === "copy") {
        // 新しいページを作る
        targetPageId = await createRestorePage(snapshot);
    } else {
        throw new Error("Replace mode is not implemented yet");
    }

    // 3. ブロックを復元する
    await restoreBlocks(
        snapshot.blocks,
        targetPageId,
        dirname(resolve(options.snapshotPath)),
    );
}

main().catch((error: unknown) => {
    console.error("復元処理に失敗しました:", error);
    process.exitCode = 1;
});
