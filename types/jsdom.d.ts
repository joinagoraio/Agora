declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string, options?: any)
    window: any
  }
}

declare module 'dompurify' {
  namespace DOMPurify {
    interface Config {
      ALLOWED_TAGS?: string[]
      ALLOWED_ATTR?: string[]
      KEEP_CONTENT?: boolean
      RETURN_DOM?: boolean
      RETURN_DOM_FRAGMENT?: boolean
      RETURN_TRUSTED_TYPE?: boolean
      FORCE_BODY?: boolean
      SANITIZE_DOM?: boolean
      IN_PLACE?: boolean
      [key: string]: any
    }

    interface SanitizeInstance {
      sanitize(source: string | Node, config?: Config): string
      setConfig(config?: Config): void
      clearConfig(): void
      isSupported: boolean
      removed: any[]
      addHook(hook: string, cb: (currentNode: Element) => void): void
      removeHook(hook: string): void
      removeHooks(hookName: string): void
      removeAllHooks(): void
    }
  }

  interface DOMPurifyStatic extends DOMPurify.SanitizeInstance {
    (window: any): DOMPurify.SanitizeInstance
  }

  const DOMPurify: DOMPurifyStatic
  export = DOMPurify
}

