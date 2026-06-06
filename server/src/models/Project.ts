// 定义一个 Project 表，用来保存用户创建的代码项目，包括项目名、HTML/CSS/JS/TS 代码内容、用户 ID、创建时间和更新时间。

import mongoose, { Schema, Document } from 'mongoose'

// 项目数据结构，表示存什么
export interface IProject extends Document {
  name: string
  files: {
    html: string
    css: string
    javascript: string
    typescript: string
  }
  userId: string
  createdAt: Date
  updatedAt: Date
}

const ProjectSchema = new Schema<IProject>({
   name: { type: String, required: true },
  files: {
    html: { type: String, default: '' },
    css: { type: String, default: '' },
    javascript: { type: String, default: '' },
    typescript: { type: String, default: '' }
  },
  userId: { type: String, default: 'default' }
})

// 导出mongoose对象
export default mongoose.model<IProject>('Project', ProjectSchema)

