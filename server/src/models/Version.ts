// 用来储存项目历史版本
import mongoose , {Schema, Document} from "mongoose"

export interface IVersion extends Document {
  projectId: mongoose.Types.ObjectId
  files: { html: string; css: string; javascript: string; typescript: string }
  description: string
  aiPatch?: string
  createdAt: Date
}

const VersionSchema = new Schema<IVersion>({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  files: {
    html: { type: String, default: '' },
    css: { type: String, default: '' },
    javascript: { type: String, default: '' },
    typescript: { type: String, default: '' }
  },
  description: { type: String, default: '手动保存' },
  aiPatch: String
}, { timestamps: true })

export default mongoose.model<IVersion>('Version', VersionSchema)