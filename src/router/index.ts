import { createRouter, createWebHashHistory } from "vue-router";
import type { RouteRecordRaw } from 'vue-router'
import Home from "../views/Home.vue";
import Editor from "../components/Editor.vue";

const routes: RouteRecordRaw[] = [
  {
    path:'/',
    redirect:'/home/html'
  },
  {
    path:'/home',
    name:'Home',
    component:Home,
    children:[
      {
        path: 'html',
        component: Editor,
        props: { language: 'html' } // 传递语言类型
      },
      {
        path: 'css',
        component: Editor,
        props: { language: 'css' }
      },
      {
        path: 'js',
        component: Editor,
        props: { language: 'javascript' }
      },
      {
        path:'react',
        component: Editor,
        props: { language:'typescript' }
      }
    ]
  }
]

const router = createRouter({
  history:createWebHashHistory(),
  routes
})

export default router