import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { library } from '@fortawesome/fontawesome-svg-core'
import { fas } from '@fortawesome/free-solid-svg-icons'
import { far } from '@fortawesome/free-regular-svg-icons'
import { fab } from '@fortawesome/free-brands-svg-icons'
import router from './router'
import './style.css'
import App from './App.vue'

const pinia = createPinia()
const app = createApp(App)

library.add(fas, far, fab)
app.component('font-awesome-icon', FontAwesomeIcon)
app.use(pinia)
app.use(router)
app.mount('#app')