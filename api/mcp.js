// Vercel entry for the hosted endpoint (https://mcp.norc.app/mcp). The build step compiles src/ to dist/.
import { handleMcp } from '../dist/handler.js'

export default handleMcp
