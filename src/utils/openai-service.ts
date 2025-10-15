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
    sceneDescription?: string;
    style: string;
    grimness: number;
}

export interface ImageGenerationResult {
    success: boolean;
    imageUrl?: string;
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

export class OpenAIImageService {
    private apiKey: string;
    private requestUrl: (request: string | RequestUrlParam) => Promise<RequestUrlResponse>;

    constructor(apiKey: string, requestUrl: (request: string | RequestUrlParam) => Promise<RequestUrlResponse>) {
        this.apiKey = apiKey;
        this.requestUrl = requestUrl;
    }

    /**
     * Sanitize text to remove problematic characters
     */
    private sanitizeText(text: string): string {
        return text
            .replace(/[^\w\s,.-]/g, '') // Remove special chars except basic punctuation
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
    }

    /**
     * Filter out words that might trigger content policy violations
     * Focuses on violence, combat, and danger terminology
     */
    private filterProblematicWords(text: string): string {
        // List of problematic words to filter out or replace
        const problematicTerms: { [key: string]: string } = {
            // Combat terms
            'battle': 'encounter',
            'fight': 'confrontation',
            'combat': 'scene',
            'attack': 'approach',
            'assault': 'encounter',
            'warfare': 'conflict',
            'raid': 'visit',

            // Violence terms
            'kill': 'defeat',
            'murder': 'conflict',
            'slaughter': 'chaos',
            'blood': 'dramatic',
            'bloody': 'intense',
            'gore': 'dramatic',
            'brutal': 'harsh',
            'savage': 'wild',
            'violent': 'intense',

            // Danger terms
            'deadly': 'serious',
            'dangerous': 'tense',
            'lethal': 'serious',
            'fatal': 'critical',
            'death': 'defeat',
            'dying': 'weakened',

            // Injury terms
            'wound': 'mark',
            'injury': 'wear',
            'bleeding': 'weathered',
            'hurt': 'affected',
            'pain': 'strain',

            // Threat terms
            'threat': 'presence',
            'menace': 'figure',
            'hostile': 'opposing',
            'aggressive': 'energetic'
        };

        let filtered = text.toLowerCase();

        // Replace problematic terms with safer alternatives
        for (const [bad, good] of Object.entries(problematicTerms)) {
            // Use word boundaries to avoid replacing parts of words
            const regex = new RegExp(`\\b${bad}\\b`, 'gi');
            filtered = filtered.replace(regex, good);
        }

        return filtered;
    }

    /**
     * Get the best visual description for a creature using a generic approach
     */
    private getCreatureDescription(creature: Creature): string {
        // Priority 1: Use appearance field if available (from Fantasy Statblocks)
        if ((creature as any).appearance && typeof (creature as any).appearance === 'string') {
            const appearance = this.sanitizeText((creature as any).appearance);
            if (appearance.length > 0) {
                console.log(`[OpenAI] Using appearance for ${creature.name}: ${appearance.substring(0, 100)}`);
                return appearance.substring(0, 100); // Limit length
            }
        }

        // Priority 2: Build from size and type (generic, works for any system)
        const size = (creature as any).size as string | undefined;
        const type = (creature as any).type as string | undefined;

        console.log(`[OpenAI] Creature ${creature.name} - size: ${size}, type: ${type}`);

        if (size || type) {
            const parts: string[] = [];
            if (size) parts.push(size.toLowerCase());
            if (type) parts.push(type.toLowerCase());
            const description = this.sanitizeText(parts.join(' '));
            console.log(`[OpenAI] Using size+type for ${creature.name}: ${description}`);
            return description;
        }

        // Priority 3: Use basic sanitized creature name as last resort
        const sanitizedName = this.sanitizeText(creature.name.toLowerCase())
            .replace(/\d+/g, '') // Remove numbers
            .trim();

        console.log(`[OpenAI] Using sanitized name for ${creature.name}: ${sanitizedName}`);
        return sanitizedName || 'creature';
    }

    /**
     * Use GPT to preprocess creature names into safe visual descriptions
     * Returns null if the preprocessing fails
     */
    private async preprocessCreaturesWithGPT(creatures: Creature[]): Promise<string | null> {
        if (creatures.length === 0) {
            return null;
        }

        try {
            // Build creature list with counts
            const creatureMap = new Map<string, number>();
            for (const creature of creatures) {
                creatureMap.set(creature.name, (creatureMap.get(creature.name) || 0) + 1);
            }

            const creatureList = Array.from(creatureMap.entries())
                .map(([name, count]) => count > 1 ? `${count}x ${name}` : name)
                .join(', ');

            console.log(`[OpenAI] Preprocessing creatures with GPT: ${creatureList}`);

            // Call GPT-4o-mini to convert creature names to safe descriptions using Obsidian's requestUrl
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
                        {
                            role: "system",
                            content: "You convert fantasy creature names into safe visual descriptions for AI image generation. CRITICAL: Avoid ALL terms that suggest violence, combat, or danger - this includes: battle, combat, fight, attack, blood, wounds, death, kill, dangerous, threatening, hostile, aggressive, weapon-wielding. Instead, focus ONLY on neutral physical appearance: size, colors, body type, creature category. Describe them as if for a museum exhibit or fantasy art reference. Be concise - 2-4 words per creature."
                        },
                        {
                            role: "user",
                            content: `Convert these creatures to safe visual descriptions: ${creatureList}\n\nReturn ONLY the descriptions in the same format (with counts), comma-separated. Example: "2x large blue reptiles, massive tentacled creature"`
                        }
                    ],
                    temperature: 0.3,
                    max_tokens: 150
                }),
                throw: false // Don't throw on HTTP errors, we'll handle them
            });

            if (response.status !== 200) {
                console.error(`[OpenAI] GPT preprocessing failed with status ${response.status}`);
                return null;
            }

            const data = response.json;
            const description = data.choices?.[0]?.message?.content?.trim();

            if (!description) {
                console.error("[OpenAI] GPT returned empty description");
                return null;
            }

            console.log(`[OpenAI] GPT preprocessed result: ${description}`);
            return description;

        } catch (error) {
            console.error("[OpenAI] GPT preprocessing error:", error);
            return null;
        }
    }

    /**
     * Generates a prompt for DALL-E based on the current battle state
     */
    private async generatePrompt(options: ImageGenerationOptions): Promise<string> {
        const { creatures, sceneDescription, style, grimness } = options;

        // Filter out hidden creatures
        const visibleCreatures = creatures.filter(c => !c.hidden && c.enabled);

        if (visibleCreatures.length === 0 && (!sceneDescription || !sceneDescription.trim())) {
            return "An empty tavern interior, fantasy setting, waiting for adventure";
        }

        // Analyze creature composition
        const monsters = visibleCreatures.filter(c => !c.player && !c.friendly);
        const players = visibleCreatures.filter(c => c.player);
        const allies = visibleCreatures.filter(c => c.friendly && !c.player);

        // Determine overall health status
        const healthAnalysis = this.analyzeHealthStatus(visibleCreatures);

        // Build prompt parts
        const parts: string[] = [];

        // Scene description (if provided) - sanitize and filter, then limit to 200 chars
        if (sceneDescription && sceneDescription.trim()) {
            let processed = this.sanitizeText(sceneDescription.trim());
            processed = this.filterProblematicWords(processed);
            if (processed && processed.length > 0) {
                parts.push(processed.substring(0, 200));
            }
        }

        // Creature composition (with GPT preprocessing)
        const creatureDesc = await this.describeCreatures(monsters, players, allies);
        if (creatureDesc) {
            parts.push(creatureDesc);
        }

        // Health/danger level based on grimness and creature status
        const moodDesc = this.describeMood(grimness, healthAnalysis);
        parts.push(moodDesc);

        // Art style
        const styleDesc = IMAGE_STYLES[style as keyof typeof IMAGE_STYLES] || IMAGE_STYLES["fantasy-art"];
        parts.push(styleDesc);

        // Important: No text or titles
        parts.push("no text, no titles, no words, no UI elements");

        let prompt = parts.join(", ");

        // DALL-E 3 has a 4000 char limit, but we'll be safer at 3500
        if (prompt.length > 3500) {
            // Truncate while keeping the important parts
            const essential = [
                creatureDesc || "fantasy battle",
                IMAGE_STYLES[style as keyof typeof IMAGE_STYLES] || IMAGE_STYLES["fantasy-art"],
                "no text"
            ].join(", ");
            prompt = essential.substring(0, 3500);
        }

        return prompt;
    }

    private analyzeHealthStatus(creatures: Creature[]): {
        defeatedCount: number;
        bloodiedCount: number;
        hurtCount: number;
        healthyCount: number;
        averageHpPercent: number;
    } {
        let defeatedCount = 0;
        let bloodiedCount = 0;
        let hurtCount = 0;
        let healthyCount = 0;
        let totalHpPercent = 0;

        for (const creature of creatures) {
            const hpPercent = creature.max > 0 ? (creature.hp / creature.max) * 100 : 0;
            totalHpPercent += hpPercent;

            if (creature.hp <= 0) {
                defeatedCount++;
            } else if (hpPercent < 50) {
                bloodiedCount++;
            } else if (hpPercent < 100) {
                hurtCount++;
            } else {
                healthyCount++;
            }
        }

        return {
            defeatedCount,
            bloodiedCount,
            hurtCount,
            healthyCount,
            averageHpPercent: creatures.length > 0 ? totalHpPercent / creatures.length : 100
        };
    }

    private async describeCreatures(monsters: Creature[], players: Creature[], allies: Creature[]): Promise<string> {
        console.log("[OpenAI] describeCreatures called with", monsters.length, "monsters,", players.length, "players");
        const parts: string[] = [];

        if (monsters.length > 0) {
            console.log("[OpenAI] About to call GPT preprocessing for monsters:", monsters.map(m => m.name).join(', '));
            // Try GPT preprocessing first for monsters
            const gptDescription = await this.preprocessCreaturesWithGPT(monsters);
            console.log("[OpenAI] GPT preprocessing returned:", gptDescription);

            if (gptDescription) {
                // GPT preprocessing succeeded
                console.log("[OpenAI] Using GPT-preprocessed monster descriptions");
                parts.push(`fantasy scene featuring ${gptDescription}`);
            } else {
                // Fallback to manual description
                console.log("[OpenAI] GPT preprocessing failed, using fallback method");

                // Group monsters by visual description
                const monsterTypes = new Map<string, number>();
                for (const monster of monsters) {
                    // Get the best visual description (appearance, size+type, or sanitized name)
                    const description = this.getCreatureDescription(monster);
                    if (description) {
                        monsterTypes.set(description, (monsterTypes.get(description) || 0) + 1);
                    }
                }

                // Limit to first 5 unique monster types to keep prompt short
                const monsterEntries = Array.from(monsterTypes.entries()).slice(0, 5);
                const monsterDesc = monsterEntries
                    .map(([description, count]) => {
                        // Smart pluralization - only add 's' if it makes sense
                        if (count > 1 && !description.endsWith('s')) {
                            return `${count} ${description}s`;
                        } else if (count > 1) {
                            return `${count} ${description}`;
                        }
                        return description;
                    })
                    .join(" and ");

                if (monsterDesc) {
                    parts.push(`fantasy scene featuring ${monsterDesc}`);
                }
            }
        }

        if (players.length > 0) {
            parts.push(`${players.length} heroic adventurer${players.length > 1 ? 's' : ''}`);
        }

        if (allies.length > 0) {
            parts.push(`${allies.length} allied figure${allies.length > 1 ? 's' : ''}`);
        }

        return parts.join(", ");
    }

    private describeMood(grimness: number, health: ReturnType<typeof this.analyzeHealthStatus>): string {
        const { defeatedCount, bloodiedCount, averageHpPercent } = health;

        // Grimness affects overall tone
        // 0-33: Hopeful/Bright
        // 34-66: Tense/Dramatic
        // 67-100: Dark/Moody

        const parts: string[] = [];

        if (grimness <= 33) {
            // Bright, hopeful tone
            parts.push("bright dramatic lighting, hopeful atmosphere");
            if (averageHpPercent < 50) {
                parts.push("weathered appearance, signs of struggle");
            } else {
                parts.push("determined poses, ready stance");
            }
        } else if (grimness <= 66) {
            // Tense, dramatic tone
            parts.push("moody atmospheric lighting, dramatic tension");
            if (bloodiedCount > 0 || defeatedCount > 0) {
                parts.push("weathered characters, worn equipment");
            }
            parts.push("intense mood, dramatic depth");
        } else {
            // Dark, moody tone
            parts.push("dark cinematic lighting, ominous atmosphere");
            if (bloodiedCount > 0) {
                parts.push("weathered appearance, dramatic shadows on figures");
            }
            if (defeatedCount > 0) {
                parts.push("scattered debris, aftermath scene");
            }
            parts.push("tense dramatic mood, high tension");
        }

        // Add environment based on grimness
        if (grimness > 50) {
            parts.push("stormy weather, dramatic environmental effects");
        } else {
            parts.push("dynamic composition, cinematic framing");
        }

        return parts.join(", ");
    }

    /**
     * Generates an image using OpenAI's DALL-E 3 API
     */
    async generateImage(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
        console.log("[OpenAI] ===== generateImage called at", new Date().toISOString(), "=====");
        console.log("[OpenAI] Number of creatures:", options.creatures.length);

        if (!this.apiKey || this.apiKey.trim() === "") {
            return {
                success: false,
                error: "OpenAI API key is not configured. Please add your API key in settings."
            };
        }

        console.log("[OpenAI] About to call generatePrompt...");
        const prompt = await this.generatePrompt(options);
        console.log("[OpenAI] Generated prompt:", prompt);

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
                    size: "1792x1024", // Landscape format for player view
                    quality: "standard" // Can be "standard" or "hd" (hd costs 2x)
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

                console.error("[OpenAI] API Error:", errorData);
                console.error("[OpenAI] Status:", response.status);

                // Extract detailed error message if available
                let errorMessage = "";
                if (errorData && errorData.error && errorData.error.message) {
                    errorMessage = errorData.error.message;
                } else if (errorData && errorData.error && typeof errorData.error === 'string') {
                    errorMessage = errorData.error;
                } else if (response.text) {
                    errorMessage = response.text.substring(0, 200); // First 200 chars of raw error
                }

                if (response.status === 401) {
                    return {
                        success: false,
                        error: "Invalid API key. Please check your OpenAI API key in settings."
                    };
                } else if (response.status === 429) {
                    return {
                        success: false,
                        error: "Rate limit exceeded. Please wait a moment and try again."
                    };
                } else if (response.status === 400) {
                    const specificError = errorMessage || "The request may have been rejected by OpenAI's content policy or formatting issues.";
                    return {
                        success: false,
                        error: `Invalid request: ${specificError}`
                    };
                }

                return {
                    success: false,
                    error: errorMessage || `OpenAI API error: ${response.status}`
                };
            }

            const data = response.json;

            if (!data.data || !data.data[0] || !data.data[0].url) {
                return {
                    success: false,
                    error: "OpenAI returned an invalid response. No image URL found."
                };
            }

            console.log("[OpenAI] Image generated successfully");

            return {
                success: true,
                imageUrl: data.data[0].url
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
            // Make a minimal request to test the key
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
