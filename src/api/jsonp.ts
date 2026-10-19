let counter = 0

/**
 * JSONP 요청. iTunes·Deezer는 CORS 헤더가 없어서 브라우저에서 바로 fetch할 수 없지만
 * callback 파라미터를 지원하므로 <script> 태그로 불러온다.
 */
export function jsonp<T>(url: string, callbackParam = 'callback', timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const name = `__jsonp_${Date.now()}_${counter++}`
    const script = document.createElement('script')
    const w = window as unknown as Record<string, unknown>
    const cleanup = () => {
      clearTimeout(timer)
      delete w[name]
      script.remove()
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('timeout'))
    }, timeoutMs)
    w[name] = (data: T) => {
      cleanup()
      resolve(data)
    }
    script.onerror = () => {
      cleanup()
      reject(new Error('network'))
    }
    script.src = `${url}${url.includes('?') ? '&' : '?'}${callbackParam}=${name}`
    document.head.appendChild(script)
  })
}

/** 동시에 n개까지만 실행한다 */
export async function pool<T, R>(items: T[], n: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return out
}
