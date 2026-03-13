import type { Creature } from "./creature";

// Obsidian's requestUrl types
interface RequestUrlParam {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string | ArrayBuffer;
    throw?: boolean;
}

interface RequestUrlResponse {
    status: number;
    headers: Record<string, string>;
    arrayBuffer: ArrayBuffer;
    json: any;
    text: string;
}

export interface ImageGenerationOptions {
    creatures: Creature[];
    userPrompt?: string;
    style: string;
    grimness: number;
}

export interface ImageGenerationResult {
    success: boolean;
    imageUrl?: string;
    generatedName?: string;
    error?: string;
}

export const IMAGE_STYLES = {
    "realistic": "photorealistic, highly detailed, cinematic lighting, 8k resolution",
    "fantasy-art": "fantasy illustration, detailed artwork, epic fantasy scene, dramatic composition",
    "comic-book": "comic book style, bold ink lines, dramatic shading, graphic novel aesthetic",
    "watercolor": "watercolor painting, soft brushstrokes, artistic, flowing colors",
    "oil-painting": "oil painting, classical art style, rich textures, museum quality",
    "digital-art": "digital art, modern illustration, vibrant colors, professional artwork",
    "anime": "anime style, dynamic composition, vivid colors, manga aesthetic",
    "cinematic": "cinematic scene, movie poster style, dramatic lighting, epic scale"
} as const;

interface PromptEnhancementResult {
    name: string;
    enhancedPrompt: string;
}

export class OpenAIImageService {
    private apiKey: string;
    private requestUrl: (request: string | RequestUrlParam) => Promise<RequestUrlResponse>;

    constructor(apiKey: string, requestUrl: (request: string | RequestUrlParam) => Promise<RequestUrlResponse>) {
        this.apiKey = apiKey;
        this.requestUrl = requestUrl;
    }

    /**
     * Single GPT-4o-mini call that enhances the user prompt and generates a name.
     * Also converts creature names to safe visual descriptions.
     */
    private async enhancePromptAndGenerateName(
        userPrompt: string,
        creatures: Creature[],
        style: string,
        grimness: number
    ): Promise<PromptEnhancementResult> {
        // Build creature context
        const visibleCreatures = creatures.filter(c => !c.hidden && c.enabled);
        const creatureMap = new Map<string, number>();
        for (const creature of visibleCreatures) {
            creatureMap.set(creature.name, (creatureMap.get(creature.name) || 0) + 1);
        }
        const creatureList = Array.from(creatureMap.entries())
            .map(([name, count]) => count > 1 ? `${count}x ${name}` : name)
            .join(", ");

        // Determine mood from grimness
        let moodGuidance: string;
        if (grimness <= 33) {
            moodGuidance = "bright, hopeful, warm lighting, inviting atmosphere";
        } else if (grimness <= 66) {
            moodGuidance = "dramatic, tense, moody lighting, atmospheric tension";
        } else {
            moodGuidance = "dark, ominous, cinematic shadows, foreboding atmosphere";
        }

        const styleDesc = IMAGE_STYLES[style as keyof typeof IMAGE_STYLES] || IMAGE_STYLES["fantasy-art"];

        const systemPrompt = `You are a creative assistant for a tabletop RPG combat tracker. Your job is to:
1. Generate a short, evocative name for a scene image (3-5 words, like "Moonlit Forest Clearing" or "Volcanic Cavern Depths")
2. Create a rich, detailed scene description for AI image generation based on the user's input

Rules:
- AVOID all violence, combat, weapons, blood, gore, death, injury, and threatening terminology
- Focus on environment, lighting, atmosphere, composition, and creature appearance
- Convert creature names to safe physical descriptions (e.g., "Dragon" → "massive scaled reptile", "Goblin" → "small green-skinned humanoid")
- Apply the requested mood and art style naturally
- The enhanced prompt should be 2-4 sentences, rich in visual detail
- Include "no text, no titles, no words, no UI elements" at the end

Respond ONLY with valid JSON: { "name": "...", "enhancedPrompt": "..." }`;

        const userMessage = [
            userPrompt ? `Scene idea: ${userPrompt}` : "Generate a generic fantasy scene",
            creatureList ? `Creatures present: ${creatureList}` : "",
            `Mood: ${moodGuidance}`,
            `Art style: ${styleDesc}`
        ].filter(Boolean).join("\n");

        try {
            const response = await this.requestUrl({
                url: "https://api.openai.com/v1/chat/completions",
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userMessage }
                    ],
                    temperature: 0.7,
                    max_tokens: 300,
                    response_format: { type: "json_object" }
                }),
                throw: false
            });

            if (response.status !== 200) {
                console.error(`[OpenAI] GPT enhancement failed with status ${response.status}`);
                return this.fallbackPrompt(userPrompt, styleDesc, moodGuidance);
            }

            const data = response.json;
            const content = data.choices?.[0]?.message?.content?.trim();

            if (!content) {
                console.error("[OpenAI] GPT returned empty content");
                return this.fallbackPrompt(userPrompt, styleDesc, moodGuidance);
            }

            const parsed = JSON.parse(content);
            if (!parsed.name || !parsed.enhancedPrompt) {
                console.error("[OpenAI] GPT returned invalid JSON structure");
                return this.fallbackPrompt(userPrompt, styleDesc, moodGuidance);
            }

            return {
                name: parsed.name,
                enhancedPrompt: parsed.enhancedPrompt
            };
        } catch (error) {
            console.error("[OpenAI] GPT enhancement error:", error);
            return this.fallbackPrompt(userPrompt, styleDesc, moodGuidance);
        }
    }

    /**
     * Fallback when GPT enhancement fails
     */
    private fallbackPrompt(userPrompt: string, styleDesc: string, moodGuidance: string): PromptEnhancementResult {
        const prompt = userPrompt || "A fantasy tavern interior, waiting for adventure";
        return {
            name: userPrompt
                ? userPrompt.substring(0, 40).replace(/[^\w\s]/g, "").trim()
                : "Fantasy Scene",
            enhancedPrompt: `${prompt}, ${moodGuidance}, ${styleDesc}, no text, no titles, no words, no UI elements`
        };
    }

    /**
     * Generates an image using OpenAI's DALL-E 3 API
     */
    async generateImage(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
        if (!this.apiKey || this.apiKey.trim() === "") {
            return {
                success: false,
                error: "OpenAI API key is not configured. Please add your API key in settings."
            };
        }

        // Enhance prompt and generate name via GPT
        const { name, enhancedPrompt } = await this.enhancePromptAndGenerateName(
            options.userPrompt || "",
            options.creatures,
            options.style,
            options.grimness
        );

        // Ensure prompt stays under DALL-E 3's 4000 char limit
        const prompt = enhancedPrompt.substring(0, 3500);

        try {
            const response = await this.requestUrl({
                url: "https://api.openai.com/v1/images/generations",
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: "dall-e-3",
                    prompt: prompt,
                    n: 1,
                    size: "1792x1024",
                    quality: "standard"
                }),
                throw: false
            });

            if (response.status !== 200) {
                let errorData: any = {};
                try {
                    errorData = response.json;
                } catch (e) {
                    console.error("[OpenAI] Failed to parse error response:", response.text);
                }

                let errorMessage = "";
                if (errorData?.error?.message) {
                    errorMessage = errorData.error.message;
                } else if (errorData?.error && typeof errorData.error === "string") {
                    errorMessage = errorData.error;
                } else if (response.text) {
                    errorMessage = response.text.substring(0, 200);
                }

                if (response.status === 401) {
                    return { success: false, error: "Invalid API key. Please check your OpenAI API key in settings." };
                } else if (response.status === 429) {
                    return { success: false, error: "Rate limit exceeded. Please wait a moment and try again." };
                } else if (response.status === 400) {
                    return { success: false, error: `Invalid request: ${errorMessage || "The request may have been rejected by OpenAI's content policy."}` };
                }

                return { success: false, error: errorMessage || `OpenAI API error: ${response.status}` };
            }

            const data = response.json;
            if (!data.data?.[0]?.url) {
                return { success: false, error: "OpenAI returned an invalid response. No image URL found." };
            }

            return {
                success: true,
                imageUrl: data.data[0].url,
                generatedName: name
            };
        } catch (error) {
            console.error("[OpenAI] Network error:", error);
            return {
                success: false,
                error: `Network error: ${error instanceof Error ? error.message : "Unknown error"}`
            };
        }
    }

    /**
     * Test the API key by making a simple request
     */
    async testApiKey(): Promise<{ valid: boolean; error?: string }> {
        if (!this.apiKey || this.apiKey.trim() === "") {
            return { valid: false, error: "API key is empty" };
        }

        try {
            const response = await this.requestUrl({
                url: "https://api.openai.com/v1/models",
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${this.apiKey}`
                },
                throw: false
            });

            if (response.status !== 200) {
                if (response.status === 401) {
                    return { valid: false, error: "Invalid API key" };
                }
                return { valid: false, error: `API error: ${response.status}` };
            }

            return { valid: true };
        } catch (error) {
            return {
                valid: false,
                error: `Network error: ${error instanceof Error ? error.message : "Unknown error"}`
            };
        }
    }
}
