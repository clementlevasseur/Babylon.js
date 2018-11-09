import { Observable } from "Misc/observable";
import { Nullable, int } from "types";
import { SphericalPolynomial } from "Maths/sphericalPolynomial";
import { Engine, RenderTargetCreationOptions } from "Engines/engine";
import { IInternalTextureTracker } from "Materials/Textures/internalTextureTracker";
import { _TimeToken } from "Instrumentation";
import { _DepthCullingState, _StencilState, _AlphaState } from "States";
import { Constants } from "Engines/constants";

declare type BaseTexture = import("Materials/Textures/baseTexture").BaseTexture;

    /**
     * Class used to store data associated with WebGL texture data for the engine
     * This class should not be used directly
     */
    export class InternalTexture implements IInternalTextureTracker {

        /** hidden */
        public static _UpdateRGBDAsync = (internalTexture: InternalTexture, data: ArrayBufferView[][], sphericalPolynomial: Nullable<SphericalPolynomial>, lodScale: number, lodOffset: number): Promise<void> => {
            throw "environmentTextureTools needs to be imported before rebuilding RGBD textures.";
        }

        /**
         * The source of the texture data is unknown
         */
        public static DATASOURCE_UNKNOWN = 0;
        /**
         * Texture data comes from an URL
         */
        public static DATASOURCE_URL = 1;
        /**
         * Texture data is only used for temporary storage
         */
        public static DATASOURCE_TEMP = 2;
        /**
         * Texture data comes from raw data (ArrayBuffer)
         */
        public static DATASOURCE_RAW = 3;
        /**
         * Texture content is dynamic (video or dynamic texture)
         */
        public static DATASOURCE_DYNAMIC = 4;
        /**
         * Texture content is generated by rendering to it
         */
        public static DATASOURCE_RENDERTARGET = 5;
        /**
         * Texture content is part of a multi render target process
         */
        public static DATASOURCE_MULTIRENDERTARGET = 6;
        /**
         * Texture data comes from a cube data file
         */
        public static DATASOURCE_CUBE = 7;
        /**
         * Texture data comes from a raw cube data
         */
        public static DATASOURCE_CUBERAW = 8;
        /**
         * Texture data come from a prefiltered cube data file
         */
        public static DATASOURCE_CUBEPREFILTERED = 9;
        /**
         * Texture content is raw 3D data
         */
        public static DATASOURCE_RAW3D = 10;
        /**
         * Texture content is a depth texture
         */
        public static DATASOURCE_DEPTHTEXTURE = 11;
        /**
         * Texture data comes from a raw cube data encoded with RGBD
         */
        public static DATASOURCE_CUBERAW_RGBD = 12;

        /**
         * Defines if the texture is ready
         */
        public isReady: boolean;
        /**
         * Defines if the texture is a cube texture
         */
        public isCube: boolean;
        /**
         * Defines if the texture contains 3D data
         */
        public is3D: boolean;
        /**
         * Gets the URL used to load this texture
         */
        public url: string;
        /**
         * Gets the sampling mode of the texture
         */
        public samplingMode: number;
        /**
         * Gets a boolean indicating if the texture needs mipmaps generation
         */
        public generateMipMaps: boolean;
        /**
         * Gets the number of samples used by the texture (WebGL2+ only)
         */
        public samples: number;
        /**
         * Gets the type of the texture (int, float...)
         */
        public type: number;
        /**
         * Gets the format of the texture (RGB, RGBA...)
         */
        public format: number;
        /**
         * Observable called when the texture is loaded
         */
        public onLoadedObservable = new Observable<InternalTexture>();
        /**
         * Gets the width of the texture
         */
        public width: number;
        /**
         * Gets the height of the texture
         */
        public height: number;
        /**
         * Gets the depth of the texture
         */
        public depth: number;
        /**
         * Gets the initial width of the texture (It could be rescaled if the current system does not support non power of two textures)
         */
        public baseWidth: number;
        /**
         * Gets the initial height of the texture (It could be rescaled if the current system does not support non power of two textures)
         */
        public baseHeight: number;
        /**
         * Gets the initial depth of the texture (It could be rescaled if the current system does not support non power of two textures)
         */
        public baseDepth: number;
        /**
         * Gets a boolean indicating if the texture is inverted on Y axis
         */
        public invertY: boolean;

        /**
         * Gets or set the previous tracker in the list
         */
        public previous: Nullable<IInternalTextureTracker> = null;
        /**
         * Gets or set the next tracker in the list
         */
        public next: Nullable<IInternalTextureTracker> = null;

        // Private
        /** @hidden */
        public _initialSlot = -1;
        /** @hidden */
        public _designatedSlot = -1;
        /** @hidden */
        public _dataSource = InternalTexture.DATASOURCE_UNKNOWN;
        /** @hidden */
        public _buffer: Nullable<string | ArrayBuffer | HTMLImageElement | Blob>;
        /** @hidden */
        public _bufferView: Nullable<ArrayBufferView>;
        /** @hidden */
        public _bufferViewArray: Nullable<ArrayBufferView[]>;
        /** @hidden */
        public _bufferViewArrayArray: Nullable<ArrayBufferView[][]>;
        /** @hidden */
        public _size: number;
        /** @hidden */
        public _extension: string;
        /** @hidden */
        public _files: Nullable<string[]>;
        /** @hidden */
        public _workingCanvas: HTMLCanvasElement;
        /** @hidden */
        public _workingContext: CanvasRenderingContext2D;
        /** @hidden */
        public _framebuffer: Nullable<WebGLFramebuffer>;
        /** @hidden */
        public _depthStencilBuffer: Nullable<WebGLRenderbuffer>;
        /** @hidden */
        public _MSAAFramebuffer: Nullable<WebGLFramebuffer>;
        /** @hidden */
        public _MSAARenderBuffer: Nullable<WebGLRenderbuffer>;
        /** @hidden */
        public _attachments: Nullable<number[]>;
        /** @hidden */
        public _cachedCoordinatesMode: Nullable<number>;
        /** @hidden */
        public _cachedWrapU: Nullable<number>;
        /** @hidden */
        public _cachedWrapV: Nullable<number>;
        /** @hidden */
        public _cachedWrapR: Nullable<number>;
        /** @hidden */
        public _cachedAnisotropicFilteringLevel: Nullable<number>;
        /** @hidden */
        public _isDisabled: boolean;
        /** @hidden */
        public _compression: Nullable<string>;
        /** @hidden */
        public _generateStencilBuffer: boolean;
        /** @hidden */
        public _generateDepthBuffer: boolean;
        /** @hidden */
        public _comparisonFunction: number = 0;
        /** @hidden */
        public _sphericalPolynomial: Nullable<SphericalPolynomial> = null;
        /** @hidden */
        public _lodGenerationScale: number = 0;
        /** @hidden */
        public _lodGenerationOffset: number = 0;

        // The following three fields helps sharing generated fixed LODs for texture filtering
        // In environment not supporting the textureLOD extension like EDGE. They are for internal use only.
        // They are at the level of the gl texture to benefit from the cache.
        /** @hidden */
        public _lodTextureHigh: BaseTexture;
        /** @hidden */
        public _lodTextureMid: BaseTexture;
        /** @hidden */
        public _lodTextureLow: BaseTexture;
        /** @hidden */
        public _isRGBD: boolean = false;

        /** @hidden */
        public _webGLTexture: Nullable<WebGLTexture>;
        /** @hidden */
        public _references: number = 1;

        private _engine: Engine;

        /**
         * Gets the Engine the texture belongs to.
         * @returns The babylon engine
         */
        public getEngine(): Engine {
            return this._engine;
        }

        /**
         * Gets the data source type of the texture (can be one of the InternalTexture.DATASOURCE_XXXX)
         */
        public get dataSource(): number {
            return this._dataSource;
        }

        /**
         * Creates a new InternalTexture
         * @param engine defines the engine to use
         * @param dataSource defines the type of data that will be used
         * @param delayAllocation if the texture allocation should be delayed (default: false)
         */
        constructor(engine: Engine, dataSource: number, delayAllocation = false) {
            this._engine = engine;
            this._dataSource = dataSource;

            if (!delayAllocation) {
                this._webGLTexture = engine._createTexture();
            }
        }

        /**
         * Increments the number of references (ie. the number of Texture that point to it)
         */
        public incrementReferences(): void {
            this._references++;
        }

        /**
         * Change the size of the texture (not the size of the content)
         * @param width defines the new width
         * @param height defines the new height
         * @param depth defines the new depth (1 by default)
         */
        public updateSize(width: int, height: int, depth: int = 1): void {
            this.width = width;
            this.height = height;
            this.depth = depth;

            this.baseWidth = width;
            this.baseHeight = height;
            this.baseDepth = depth;

            this._size = width * height * depth;
        }

        /** @hidden */
        public _rebuild(): void {
            var proxy: InternalTexture;
            this.isReady = false;
            this._cachedCoordinatesMode = null;
            this._cachedWrapU = null;
            this._cachedWrapV = null;
            this._cachedAnisotropicFilteringLevel = null;

            switch (this._dataSource) {
                case InternalTexture.DATASOURCE_TEMP:
                    return;

                case InternalTexture.DATASOURCE_URL:
                    proxy = this._engine.createTexture(this.url, !this.generateMipMaps, this.invertY, null, this.samplingMode, () => {
                        proxy._swapAndDie(this);
                        this.isReady = true;
                    }, null, this._buffer, undefined, this.format);
                    return;

                case InternalTexture.DATASOURCE_RAW:
                    proxy = this._engine.createRawTexture(this._bufferView, this.baseWidth, this.baseHeight, this.format, this.generateMipMaps,
                        this.invertY, this.samplingMode, this._compression);
                    proxy._swapAndDie(this);

                    this.isReady = true;
                    return;

                case InternalTexture.DATASOURCE_RAW3D:
                    proxy = this._engine.createRawTexture3D(this._bufferView, this.baseWidth, this.baseHeight, this.baseDepth, this.format, this.generateMipMaps,
                        this.invertY, this.samplingMode, this._compression);
                    proxy._swapAndDie(this);

                    this.isReady = true;
                    return;

                case InternalTexture.DATASOURCE_DYNAMIC:
                    proxy = this._engine.createDynamicTexture(this.baseWidth, this.baseHeight, this.generateMipMaps, this.samplingMode);
                    proxy._swapAndDie(this);
                    this._engine.updateDynamicTexture(this, this._engine.getRenderingCanvas()!, this.invertY, undefined, undefined, true);

                    // The engine will make sure to update content so no need to flag it as isReady = true
                    return;

                case InternalTexture.DATASOURCE_RENDERTARGET:
                    let options = new RenderTargetCreationOptions();
                    options.generateDepthBuffer = this._generateDepthBuffer;
                    options.generateMipMaps = this.generateMipMaps;
                    options.generateStencilBuffer = this._generateStencilBuffer;
                    options.samplingMode = this.samplingMode;
                    options.type = this.type;

                    if (this.isCube) {
                        proxy = this._engine.createRenderTargetCubeTexture(this.width, options);
                    } else {
                        let size = {
                            width: this.width,
                            height: this.height
                        };

                        proxy = this._engine.createRenderTargetTexture(size, options);
                    }
                    proxy._swapAndDie(this);

                    this.isReady = true;
                    return;
                case InternalTexture.DATASOURCE_DEPTHTEXTURE:
                    let depthTextureOptions = {
                        bilinearFiltering: this.samplingMode !== Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
                        comparisonFunction: this._comparisonFunction,
                        generateStencil: this._generateStencilBuffer,
                        isCube: this.isCube
                    };

                    proxy = this._engine.createDepthStencilTexture({ width: this.width, height: this.height }, depthTextureOptions);
                    proxy._swapAndDie(this);

                    this.isReady = true;
                    return;

                case InternalTexture.DATASOURCE_CUBE:
                    proxy = this._engine.createCubeTexture(this.url, null, this._files, !this.generateMipMaps, () => {
                        proxy._swapAndDie(this);
                        this.isReady = true;
                    }, null, this.format, this._extension);
                    return;

                case InternalTexture.DATASOURCE_CUBERAW:
                    proxy = this._engine.createRawCubeTexture(this._bufferViewArray!, this.width, this.format, this.type, this.generateMipMaps, this.invertY, this.samplingMode, this._compression);
                    proxy._swapAndDie(this);
                    this.isReady = true;
                    return;

                case InternalTexture.DATASOURCE_CUBERAW_RGBD:
                    proxy = this._engine.createRawCubeTexture(null, this.width, this.format, this.type, this.generateMipMaps, this.invertY, this.samplingMode, this._compression);
                    InternalTexture._UpdateRGBDAsync(proxy, this._bufferViewArrayArray!, this._sphericalPolynomial, this._lodGenerationScale, this._lodGenerationOffset).then(() => {
                        proxy._swapAndDie(this);
                        this.isReady = true;
                    });
                    return;

                case InternalTexture.DATASOURCE_CUBEPREFILTERED:
                    proxy = this._engine.createPrefilteredCubeTexture(this.url, null, this._lodGenerationScale, this._lodGenerationOffset, (proxy) => {
                        if (proxy) {
                            proxy._swapAndDie(this);
                        }

                        this.isReady = true;
                    }, null, this.format, this._extension);
                    proxy._sphericalPolynomial = this._sphericalPolynomial;
                    return;
            }
        }

        /** @hidden */
        public _swapAndDie(target: InternalTexture): void {
            target._webGLTexture = this._webGLTexture;

            if (this._framebuffer) {
                target._framebuffer = this._framebuffer;
            }

            if (this._depthStencilBuffer) {
                target._depthStencilBuffer = this._depthStencilBuffer;
            }

            if (this._lodTextureHigh) {
                if (target._lodTextureHigh) {
                    target._lodTextureHigh.dispose();
                }
                target._lodTextureHigh = this._lodTextureHigh;
            }

            if (this._lodTextureMid) {
                if (target._lodTextureMid) {
                    target._lodTextureMid.dispose();
                }
                target._lodTextureMid = this._lodTextureMid;
            }

            if (this._lodTextureLow) {
                if (target._lodTextureLow) {
                    target._lodTextureLow.dispose();
                }
                target._lodTextureLow = this._lodTextureLow;
            }

            let cache = this._engine.getLoadedTexturesCache();
            var index = cache.indexOf(this);
            if (index !== -1) {
                cache.splice(index, 1);
            }
        }

        /**
         * Dispose the current allocated resources
         */
        public dispose(): void {
            if (!this._webGLTexture) {
                return;
            }

            this._references--;
            if (this._references === 0) {
                this._engine._releaseTexture(this);
                this._webGLTexture = null;
                this.previous = null;
                this.next = null;
            }
        }
    }
