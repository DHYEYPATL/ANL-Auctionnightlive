import axios from 'axios'

let token: string | null = null

export function setToken(t: string | null) {
  token = t
}

export function getToken() {
  return token
}

const client = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use((config) => {
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      setToken(null)
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default client
