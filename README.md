# Memory Match
###############################
A concept demo for a NextLeap PM case on finding half-remembered photos in Google Photos. It is not a Google product.

You describe a photo in your own words. The app turns the sentence into tags you can see and edit (who, where, when, details, words in the photo), searches with all of them together, and shows the six best photos with a line saying what matched (✓), what was close (~) and what was missing (✗). Look-alike photos from the same moment are stacked into one tile. When nothing matches everything, it shows the closest photos and asks one follow-up question.

## How it works

- **Reading the sentence:** `api/parse.js` asks Gemini to turn the sentence into tags. If no key is set or the call fails, the page uses the rule-based reader in `engine.js`.
- **Searching and explaining:** rules in `engine.js` score every photo on every tag. Dates are fuzzy, so a photo a few weeks off still shows up as "close". The "what matched" line is built only from the photo's own labels, so it can't invent a reason.
- **Sample library:** `data/library.json` holds 124 photos of a fictional user, Aarav. 110 are openly licensed photos found through Openverse (credits in the app), and 14 tickets, bills and policies were made for the demo. Every name, place and date attached to them is made up.
- **Test tasks:** six tasks come from the hypothetical interviews. The side panel compares each search with one-word search (newest first), and records demo measurements. These come from a sample library and are not user research.

## Run locally

Serve the folder with any static server, for example `python3 -m http.server`. Without the API, the page uses the rule-based reader.

## Deploy on Vercel

Import the repo, leave the framework as "Other" with no build command, and add `GEMINI_API_KEY` under Environment Variables. `GEMINI_MODELS` (comma-separated) is optional.
