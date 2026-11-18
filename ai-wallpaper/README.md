# AI Wallpaper CLI

Generate vivid, varied desktop wallpapers with the OpenAI Images API. This is the desktop CLI in the Nx monorepo; the Android application is separate.

## Requirements

- Linux desktop (GNOME for the optional spanning mode)
- Node.js 22+
- OpenAI API key with access to GPT-Image-2.6 and GPT-6 Luna
- A configured desktop wallpaper backend (existing npm wallpaper package)

## Install

From the repository root:

    npm ci
    npx nx run ai-wallpaper:build
    npm link --workspace=ai-wallpaper
    export OPENAI_API_KEY='your-key'

Run ai-wallpaper doctor to check local configuration. Keep the API key in your normal shell environment. Image requests incur API charges.

The commands ai-wallpaper and wallpaper are aliases. If the new alias is unavailable after pulling, rerun npm install / npm link --workspace=ai-wallpaper.

## Use

    wallpaper presets
    wallpaper
    wallpaper --preset minimal-abstract
    wallpaper --preset abstract-girl --extra 'electric blue and coral, strong asymmetry'
    wallpaper --preset abstract-girl --extra 'warm neon' --extra 'tiny woman in the upper left'
    wallpaper 'an architectural abstraction inspired by folded paper'
    wallpaper --model flare --quality medium --complexity low
    wallpaper --model sunburst --quality high --size 2560x1600
    wallpaper --stream
    wallpaper --span
    wallpaper --no-apply
    wallpaper --dry-run --preset abstract-girl --extra 'ultra minimal'
    wallpaper history
    wallpaper restore 1
    wallpaper stats
    wallpaper doctor

- First interactive run asks for a preset. Subsequent runs remember the last selected preset. Non-interactive runs default to abstract-girl if no preset has been selected.
- Custom prompts and --extra do not overwrite the last selected preset.
- Default model: gpt-image-2.6-sunburst; quality high, complexity medium, size 2560x1600. Select --model flare for faster exploration.
- Every generation normally calls gpt-6-luna to invent an original art concept, considers the last 30 concepts and rejects very similar suggestions. Use --no-concept to skip this extra paid request.
- --stream saves up to two progressive previews in the output folder, then removes them on completion. Partial images incur additional tokens.
- Normally the same image is used for all monitors. --span opts into continuous GNOME multi-screen wallpaper.
- --dry-run prints the base prompt, skipping all API calls. A new concept is added only during a real run.
- Failures identify the stage (concept, image API, save, or wallpaper application). Retry is limited to temporary/network failures, with status and request ID.

## Custom presets

Create ~/.config/ai-wallpaper/presets.json (or use $XDG_CONFIG_HOME/ai-wallpaper/presets.json):

    {
      "graphic-poppies": {
        "description": "Bold botanical graphic art",
        "prompt": "Colorful minimalist poppy artwork with daring negative space and original silhouettes"
      }
    }

Custom presets supplement the nine built-ins; an equal name overrides the built-in. Validation errors identify the bad preset.

## Files, history and costs

- State/history: ~/.config/ai-wallpaper/state.json
- Preset overrides: ~/.config/ai-wallpaper/presets.json
- Generated images: ~/Pictures/GeneratedWallpapers (or $AI_WALLPAPER_OUTPUT_DIR)
- Full prompt, model, quality, size, new concept, token usage, file path and applied status are saved locally.
- wallpaper history lists the newest 20 outputs. wallpaper restore 1 reapplies the newest generated image.
- Images are never deleted automatically.
- wallpaper stats reports an approximate image API cost based on token usage breakdown. It excludes concept generation, retries and entries lacking usage data.

## Troubleshooting

    wallpaper doctor
    wallpaper --dry-run
    wallpaper --no-concept --model flare --quality low

A 401/403 often means a missing/invalid API key or no model access; 429 can mean rate limit or quota. Non-retryable errors fail immediately. A desktop application failure leaves the image and history intact.

The Android app is a separate implementation and is not changed here.

API guide: https://developers.openai.com/api/docs/guides/image-generation
