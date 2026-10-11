import type { RichTextItemResponse } from "@notionhq/client";
import type { NotionBlock, AppendBlock } from "./types.js";

type ParagraphRequest = Extract<AppendBlock, { type?: "paragraph" }>;

type RichTextItemRequest =
    NonNullable<ParagraphRequest["paragraph"]>["rich_text"][number];

function toRichTextItem(
    item: RichTextItemResponse
): RichTextItemRequest {
    switch (item.type) {
        case "text":
            return {
                type: "text",
                text: {
                    content: item.text.content,
                    link: item.text.link,
                },
                annotations: item.annotations,
            } as RichTextItemRequest;

        case "mention": {
            const mention = item.mention as { type?: string };

            if (
                mention.type === "user" ||
                mention.type === "date" ||
                mention.type === "page" ||
                mention.type === "database" ||
                mention.type === "template_mention" ||
                mention.type === "custom_emoji"
            ) {
                return {
                    type: "mention",
                    mention: item.mention as never,
                    annotations: item.annotations,
                } as RichTextItemRequest;
            }

            return {
                type: "text",
                text: {
                    content: item.plain_text,
                    link: null,
                },
                annotations: item.annotations,
            } as RichTextItemRequest;
        }

        case "equation":
            return {
                type: "equation",
                equation: item.equation as never,
                annotations: item.annotations,
            } as RichTextItemRequest;

        default: {
            const unsupported = item as { type?: string };
            throw new Error(
                `未対応のリッチテキスト: ${unsupported.type ?? "unknown"}`
            );
        }
    }
}

function toRichTextItems(
    items: RichTextItemResponse[] | undefined
): RichTextItemRequest[] {
    return (items ?? []).map(toRichTextItem);
}

function toCaption(
    caption: RichTextItemResponse[] | undefined
): RichTextItemRequest[] | undefined {
    return caption ? toRichTextItems(caption) : undefined;
}

// restore.ts から使う関数
export function toAppendBlock(
    block: NotionBlock
): AppendBlock {
    if (!("type" in block)) {
        throw new Error(
            "ブロックの詳細情報が不足しているため、復元できません"
        );
    }

    switch (block.type) {
        case "paragraph":
            return {
                type: "paragraph",
                paragraph: {
                    rich_text: toRichTextItems(block.paragraph.rich_text),
                    color: block.paragraph.color,
                    icon: (block.paragraph.icon ?? undefined) as any,
                },
            } as AppendBlock;

        case "heading_1":
            return {
                type: "heading_1",
                heading_1: {
                    rich_text: toRichTextItems(block.heading_1.rich_text),
                    color: block.heading_1.color,
                    is_toggleable: block.heading_1.is_toggleable,
                },
            } as AppendBlock;

        case "heading_2":
            return {
                type: "heading_2",
                heading_2: {
                    rich_text: toRichTextItems(block.heading_2.rich_text),
                    color: block.heading_2.color,
                    is_toggleable: block.heading_2.is_toggleable,
                },
            } as AppendBlock;

        case "heading_3":
            return {
                type: "heading_3",
                heading_3: {
                    rich_text: toRichTextItems(block.heading_3.rich_text),
                    color: block.heading_3.color,
                    is_toggleable: block.heading_3.is_toggleable,
                },
            } as AppendBlock;

        case "heading_4":
            return {
                type: "heading_4",
                heading_4: {
                    rich_text: toRichTextItems(block.heading_4.rich_text),
                    color: block.heading_4.color,
                    is_toggleable: block.heading_4.is_toggleable,
                },
            } as AppendBlock;

        case "bulleted_list_item":
            return {
                type: "bulleted_list_item",
                bulleted_list_item: {
                    rich_text: toRichTextItems(block.bulleted_list_item.rich_text),
                    color: block.bulleted_list_item.color,
                },
            } as AppendBlock;

        case "numbered_list_item":
            return {
                type: "numbered_list_item",
                numbered_list_item: {
                    rich_text: toRichTextItems(block.numbered_list_item.rich_text),
                    color: block.numbered_list_item.color,
                },
            } as AppendBlock;

        case "quote":
            return {
                type: "quote",
                quote: {
                    rich_text: toRichTextItems(block.quote.rich_text),
                    color: block.quote.color,
                },
            } as AppendBlock;

        case "to_do":
            return {
                type: "to_do",
                to_do: {
                    rich_text: toRichTextItems(block.to_do.rich_text),
                    checked: block.to_do.checked,
                    color: block.to_do.color,
                },
            } as AppendBlock;

        case "toggle":
            return {
                type: "toggle",
                toggle: {
                    rich_text: toRichTextItems(block.toggle.rich_text),
                    color: block.toggle.color,
                },
            } as AppendBlock;

        case "template":
            return {
                type: "template",
                template: {
                    rich_text: toRichTextItems(block.template.rich_text),
                },
            } as AppendBlock;

        case "callout":
            return {
                type: "callout",
                callout: {
                    rich_text: toRichTextItems(block.callout.rich_text),
                    icon: (block.callout.icon ?? undefined) as any,
                    color: block.callout.color,
                },
            } as AppendBlock;

        case "code":
            return {
                type: "code",
                code: {
                    rich_text: toRichTextItems(block.code.rich_text),
                    language: block.code.language,
                    caption: toCaption(block.code.caption),
                },
            } as AppendBlock;

        case "equation":
            return {
                type: "equation",
                equation: {
                    expression: block.equation.expression,
                },
            } as AppendBlock;

        case "divider":
            return {
                type: "divider",
                divider: {},
            } as AppendBlock;

        case "breadcrumb":
            return {
                type: "breadcrumb",
                breadcrumb: {},
            } as AppendBlock;

        case "table_of_contents":
            return {
                type: "table_of_contents",
                table_of_contents: {
                    color: block.table_of_contents.color,
                },
            } as AppendBlock;

        case "link_to_page":
            return {
                type: "link_to_page",
                link_to_page: {
                    ...block.link_to_page,
                },
            } as AppendBlock;

        case "table_row":
            return {
                type: "table_row",
                table_row: {
                    cells: block.table_row.cells.map((row) =>
                        toRichTextItems(row)
                    ),
                },
            } as AppendBlock;

        case "embed":
            return {
                type: "embed",
                embed: {
                    ...(block.embed as any),
                    caption: toCaption(block.embed.caption),
                },
            } as AppendBlock;

        case "bookmark":
            return {
                type: "bookmark",
                bookmark: {
                    ...(block.bookmark as any),
                    caption: toCaption(block.bookmark.caption),
                },
            } as AppendBlock;

        case "image": {
            const { caption, ...image } = block.image as any;
            const media = image.type === "external"
                ? { type: "external", external: { url: image.external.url }, caption: toCaption(caption) }
                : { type: "external", external: { url: image.file.url }, caption: toCaption(caption) };
            return {
                type: "image",
                image: media,
            } as AppendBlock;
        }

        case "video": {
            const { caption, ...video } = block.video as any;
            const media = video.type === "external"
                ? { type: "external", external: { url: video.external.url }, caption: toCaption(caption) }
                : { type: "external", external: { url: video.file.url }, caption: toCaption(caption) };
            return {
                type: "video",
                video: media,
            } as AppendBlock;
        }

        case "pdf": {
            const { caption, ...pdf } = block.pdf as any;
            const media = pdf.type === "external"
                ? { type: "external", external: { url: pdf.external.url }, caption: toCaption(caption) }
                : { type: "external", external: { url: pdf.file.url }, caption: toCaption(caption) };
            return {
                type: "pdf",
                pdf: media,
            } as AppendBlock;
        }

        case "file": {
            const { caption, ...file } = block.file as any;
            const media = file.type === "external"
                ? { type: "external", external: { url: file.external.url }, name: file.name, caption: toCaption(caption) }
                : { type: "external", external: { url: file.file.url }, name: file.name, caption: toCaption(caption) };
            return {
                type: "file",
                file: media,
            } as AppendBlock;
        }

        case "audio": {
            const { caption, ...audio } = block.audio as any;
            const media = audio.type === "external"
                ? { type: "external", external: { url: audio.external.url }, caption: toCaption(caption) }
                : { type: "external", external: { url: audio.file.url }, caption: toCaption(caption) };
            return {
                type: "audio",
                audio: media,
            } as AppendBlock;
        }

        case "synced_block":
            return {
                type: "synced_block",
                synced_block: {
                    ...(block.synced_block as any),
                },
            } as AppendBlock;

        default:
            throw new Error(`未対応のブロック: ${block.type}`);
    }
}
