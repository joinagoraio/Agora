// DOMMatrix polyfill for Node.js environment
// This must be imported BEFORE any pdf.js imports to ensure DOMMatrix is available
// when pdf.js modules are evaluated

// Execute immediately at module load time
if (typeof globalThis.DOMMatrix === "undefined") {
  try {
    // Use node-dommatrix polyfill for proper DOMMatrix support in Node.js
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dommatrix = require("node-dommatrix")
    globalThis.DOMMatrix = dommatrix.DOMMatrix
    globalThis.DOMMatrixReadOnly = dommatrix.DOMMatrixReadOnly || dommatrix.DOMMatrix
  } catch (error) {
    console.error("[DOMMatrix Polyfill] Failed to load node-dommatrix:", error)
    // Fallback: provide minimal polyfill if node-dommatrix fails to load
    globalThis.DOMMatrix = class DOMMatrix {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
      m11 = 1; m12 = 0; m21 = 0; m22 = 1; m41 = 0; m42 = 0
      m13 = 0; m14 = 0; m23 = 0; m24 = 0; m31 = 0; m32 = 0; m33 = 1; m34 = 0; m43 = 0; m44 = 1
      constructor(init?: string | number[]) {
        if (init) {
          if (typeof init === "string") {
            // Parse matrix string (simplified)
            const values = init.match(/[\d.-]+/g)?.map(Number) || []
            if (values.length >= 6) {
              this.a = values[0]; this.b = values[1]
              this.c = values[2]; this.d = values[3]
              this.e = values[4]; this.f = values[5]
              this.m11 = values[0]; this.m12 = values[1]
              this.m21 = values[2]; this.m22 = values[3]
              this.m41 = values[4]; this.m42 = values[5]
            }
          } else if (Array.isArray(init) && init.length >= 6) {
            this.a = init[0]; this.b = init[1]
            this.c = init[2]; this.d = init[3]
            this.e = init[4]; this.f = init[5]
            this.m11 = init[0]; this.m12 = init[1]
            this.m21 = init[2]; this.m22 = init[3]
            this.m41 = init[4]; this.m42 = init[5]
          }
        }
      }
      multiply(other?: DOMMatrix) { return this }
      translate(tx?: number, ty?: number) { return this }
      scale(sx?: number, sy?: number) { return this }
      rotate(angle?: number) { return this }
      rotateAxisAngle(x?: number, y?: number, z?: number, angle?: number) { return this }
      scale3d(scale?: number) { return this }
      scaleNonUniform(scaleX?: number, scaleY?: number) { return this }
      toString() { return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})` }
    } as any
    globalThis.DOMMatrixReadOnly = globalThis.DOMMatrix
  }
}

// Side-effect export to ensure this module is executed
export {}
