import { mkdirSync, writeFileSync } from "node:fs";
import { trainModel } from "../shared/engine/train";

const model = trainModel();
mkdirSync("shared/generated", { recursive: true });
writeFileSync("shared/generated/model.json", JSON.stringify(model));
console.log(`Trained on ${model.metrics.documents} documents, held-out AUC ${model.metrics.heldOutAuc}`);
