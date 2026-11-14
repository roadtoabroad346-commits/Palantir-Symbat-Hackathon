import { getHub } from "@startify/shared/v2/http";
import type { App } from "@startify/shared/v2/types";
const app = process.argv[2] as App;
getHub(app).store.close();
console.log(`${app}: additive V2 identities and legacy maps prepared`);
