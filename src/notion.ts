import "dotenv/config";
import { Client } from "@notionhq/client";

const token = process.env.NOTION_TOKEN;

if (!token) {
    throw new Error("NOTION_TOKEN is not set");
}

export const notion = new Client({
    auth: token,
});