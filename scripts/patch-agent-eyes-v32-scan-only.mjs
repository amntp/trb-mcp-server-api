import { readFile, writeFile } from "node:fs/promises";

const path = new URL("../src/tc-extension-html.ts", import.meta.url);
let source = await readFile(path, "utf8");

const oldBlock = `    const normalizedGroups = visibleGroups.map((group) => ({
      modelId:group.modelId,
      objectRuntimeIds:Array.from(new Set(group.objectRuntimeIds || []))
    })).filter((group) => group.objectRuntimeIds.length > 0);`;

const newBlock = `    const normalizedGroups = visibleGroups.map((group) => {
      const objects = Array.isArray(group.objects) ? group.objects : [];
      const ids = objects.length
        ? objects.map((obj) => obj && obj.id).filter((id) => id !== undefined && id !== null)
        : (group.objectRuntimeIds || []);

      return {
        modelId:group.modelId,
        objectRuntimeIds:Array.from(new Set(ids))
      };
    }).filter((group) => group.objectRuntimeIds.length > 0);`;

if (!source.includes(oldBlock)) {
  console.error("Agent Eyes scan patch marker not found; leaving stable source unchanged.");
  process.exit(0);
}

source = source.replace(oldBlock, newBlock);
source = source.replace("V3.1 Mengen / Stückliste", "V3.2 Mengen / Stückliste");
source = source.replace("Agent Eyes V3.1 Stückliste", "Agent Eyes V3.2 Stückliste");

await writeFile(path, source, "utf8");
console.log("Agent Eyes V3.2 minimal scanner fix applied");
