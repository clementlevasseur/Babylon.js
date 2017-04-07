module BABYLON {
    export class RenderingGroup {
        private _scene: Scene;
        private _opaqueSubMeshes = new SmartArray<SubMesh>(256);
        private _transparentSubMeshes = new SmartArray<SubMesh>(256);
        private _alphaTestSubMeshes = new SmartArray<SubMesh>(256);
        private _particleSystems = new SmartArray<ParticleSystem>(256);
        private _spriteManagers = new SmartArray<SpriteManager>(256);
        private _activeVertices: number;

        private _opaqueSortCompareFn: (a: SubMesh, b: SubMesh) => number;
        private _alphaTestSortCompareFn: (a: SubMesh, b: SubMesh) => number;
        private _transparentSortCompareFn: (a: SubMesh, b: SubMesh) => number;

        private _renderOpaque: (subMeshes: SmartArray<SubMesh>) => void;
        private _renderAlphaTest: (subMeshes: SmartArray<SubMesh>) => void;
        private _renderTransparent: (subMeshes: SmartArray<SubMesh>) => void;

        public onBeforeTransparentRendering: () => void;

        // oclusion query
        private _vertexBuffers: { [key: string]: VertexBuffer } = {};
        private _indexBuffer: WebGLBuffer;
        private _colorShader: ShaderMaterial;

        /**
         * Set the opaque sort comparison function.
         * If null the sub meshes will be render in the order they were created
         */
        public set opaqueSortCompareFn(value: (a: SubMesh, b: SubMesh) => number) {
            this._opaqueSortCompareFn = value;
            if (value) {
                this._renderOpaque = this.renderOpaqueSorted;
            }
            else {
                this._renderOpaque = RenderingGroup.renderUnsorted;
            }
        }

        /**
         * Set the alpha test sort comparison function.
         * If null the sub meshes will be render in the order they were created
         */
        public set alphaTestSortCompareFn(value: (a: SubMesh, b: SubMesh) => number) {
            this._alphaTestSortCompareFn = value;
            if (value) {
                this._renderAlphaTest = this.renderAlphaTestSorted;
            }
            else {
                this._renderAlphaTest = RenderingGroup.renderUnsorted;
            }
        }

        /**
         * Set the transparent sort comparison function.
         * If null the sub meshes will be render in the order they were created
         */
        public set transparentSortCompareFn(value: (a: SubMesh, b: SubMesh) => number) {
            if (value) {
                this._transparentSortCompareFn = value;
            }
            else {
                this._transparentSortCompareFn = RenderingGroup.defaultTransparentSortCompare;
            }
            this._renderTransparent = this.renderTransparentSorted;
        }

        /**
         * Creates a new rendering group.
         * @param index The rendering group index
         * @param opaqueSortCompareFn The opaque sort comparison function. If null no order is applied
         * @param alphaTestSortCompareFn The alpha test sort comparison function. If null no order is applied
         * @param transparentSortCompareFn The transparent sort comparison function. If null back to front + alpha index sort is applied
         */
        constructor(public index: number, scene: Scene,
            opaqueSortCompareFn: (a: SubMesh, b: SubMesh) => number = null,
            alphaTestSortCompareFn: (a: SubMesh, b: SubMesh) => number = null,
            transparentSortCompareFn: (a: SubMesh, b: SubMesh) => number = null) {
            this._scene = scene;

            this.opaqueSortCompareFn = opaqueSortCompareFn;
            this.alphaTestSortCompareFn = alphaTestSortCompareFn;
            this.transparentSortCompareFn = transparentSortCompareFn;
        }

        /**
         * Render all the sub meshes contained in the group.
         * @param customRenderFunction Used to override the default render behaviour of the group.
         * @returns true if rendered some submeshes.
         */
        public render(customRenderFunction: (opaqueSubMeshes: SmartArray<SubMesh>, transparentSubMeshes: SmartArray<SubMesh>, alphaTestSubMeshes: SmartArray<SubMesh>) => void, renderSprites: boolean, renderParticles: boolean, activeMeshes: AbstractMesh[]): void {
            if (customRenderFunction) {
                customRenderFunction(this._opaqueSubMeshes, this._alphaTestSubMeshes, this._transparentSubMeshes);
                return;
            }

            var engine = this._scene.getEngine();

            // Opaque
            if (this._opaqueSubMeshes.length !== 0) {
                //this._renderOpaque(this._opaqueSubMeshes);
                this._renderOcclusionQuery(this._opaqueSubMeshes, this._scene.activeCamera.globalPosition);
            }

            // Alpha test
            if (this._alphaTestSubMeshes.length !== 0) {
                engine.setAlphaTesting(true);
                this._renderAlphaTest(this._alphaTestSubMeshes);
                engine.setAlphaTesting(false);
            }

            var stencilState = engine.getStencilBuffer();
            engine.setStencilBuffer(false);
            // Sprites
            if (renderSprites) {
                this._renderSprites();
            }

            // Particles
            if (renderParticles) {
                this._renderParticles(activeMeshes);
            }

            if (this.onBeforeTransparentRendering) {
                this.onBeforeTransparentRendering();
            }

            // Transparent
            if (this._transparentSubMeshes.length !== 0) {
                this._renderTransparent(this._transparentSubMeshes);
                engine.setAlphaMode(Engine.ALPHA_DISABLE);
            }
            engine.setStencilBuffer(stencilState);
        }

        /**
         * Renders the opaque submeshes in the order from the opaqueSortCompareFn.
         * @param subMeshes The submeshes to render
         */
        private renderOpaqueSorted(subMeshes: SmartArray<SubMesh>): void {
            return RenderingGroup.renderSorted(subMeshes, this._opaqueSortCompareFn, this._scene.activeCamera.globalPosition, false);
        }

        /**
         * Renders the opaque submeshes in the order from the alphatestSortCompareFn.
         * @param subMeshes The submeshes to render
         */
        private renderAlphaTestSorted(subMeshes: SmartArray<SubMesh>): void {
            return RenderingGroup.renderSorted(subMeshes, this._alphaTestSortCompareFn, this._scene.activeCamera.globalPosition, false);
        }

        /**
         * Renders the opaque submeshes in the order from the transparentSortCompareFn.
         * @param subMeshes The submeshes to render
         */
        private renderTransparentSorted(subMeshes: SmartArray<SubMesh>): void {
            return RenderingGroup.renderSorted(subMeshes, this._transparentSortCompareFn, this._scene.activeCamera.globalPosition, true);
        }

        /**
         * Renders the submeshes in a specified order.
         * @param subMeshes The submeshes to sort before render
         * @param sortCompareFn The comparison function use to sort
         * @param cameraPosition The camera position use to preprocess the submeshes to help sorting
         * @param transparent Specifies to activate blending if true
         */
        private static renderSorted(subMeshes: SmartArray<SubMesh>, sortCompareFn: (a: SubMesh, b: SubMesh) => number, cameraPosition: Vector3, transparent: boolean): void {
            let subIndex = 0;
            let subMesh;
            for (; subIndex < subMeshes.length; subIndex++) {
                subMesh = subMeshes.data[subIndex];
                subMesh._alphaIndex = subMesh.getMesh().alphaIndex;
                subMesh._distanceToCamera = subMesh.getBoundingInfo().boundingSphere.centerWorld.subtract(cameraPosition).length();
            }

            let sortedArray = subMeshes.data.slice(0, subMeshes.length);
            sortedArray.sort(sortCompareFn);

            for (subIndex = 0; subIndex < sortedArray.length; subIndex++) {
                subMesh = sortedArray[subIndex];
                subMesh.render(transparent);
            }
        }

        /**
         * Renders the submeshes in the order they were dispatched (no sort applied).
         * @param subMeshes The submeshes to render
         */
        private static renderUnsorted(subMeshes: SmartArray<SubMesh>): void {
            for (var subIndex = 0; subIndex < subMeshes.length; subIndex++) {
                let submesh = subMeshes.data[subIndex];
                submesh.render(false);
            }
        }

        private _renderOcclusionQuery(subMeshes: SmartArray<SubMesh>, cameraPosition: Vector3): void {
            if (subMeshes.length === 0) {
                return;
            }
            var engine = this._scene.getEngine();

            subMeshes.forEach(function (subMesh) {
                subMesh._distanceToCamera = subMesh.getBoundingInfo().boundingSphere.centerWorld.subtract(this._scene.activeCamera.position).length();
            }.bind(this));
            var sm = subMeshes.data.slice(0).sort(RenderingGroup.frontToBackSortCompare);

            if (!this._colorShader) {
              this._colorShader = new ShaderMaterial("colorShader", this._scene, "color",
                  {
                      attributes: [VertexBuffer.PositionKind],
                      uniforms: ["worldViewProjection", "color"]
                  });


              var boxdata = VertexData.CreateBox(1.0);
              this._vertexBuffers[VertexBuffer.PositionKind] = new VertexBuffer(engine, boxdata.positions, VertexBuffer.PositionKind, false);
              this._indexBuffer = engine.createIndexBuffer(boxdata.indices);
            }

            if (!this._colorShader.isReady()) {
                return;
            }

            engine.setDepthWrite(false);
            this._colorShader._preBind();

            var tick = function(sm, gl, query){
                if(!engine._gl.getQueryParameter(query,engine._gl.QUERY_RESULT_AVAILABLE)){
                    requestAnimationFrame(function () {tick(sm, gl, query)});
                    return;
                }

                var result = engine._gl.getQueryParameter(query,engine._gl.QUERY_RESULT);
                console.log(Number(result) + " " + sm._mesh.name);
                engine._gl.deleteQuery(query);
            }

            for (var boundingBoxIndex = 0; boundingBoxIndex < subMeshes.length; boundingBoxIndex++) {
                sm[boundingBoxIndex].refreshBoundingInfo();
                var boundingBox = sm[boundingBoxIndex].getBoundingInfo().boundingBox;
                var min = boundingBox.minimum;
                var max = boundingBox.maximum;
                var diff = max.subtract(min);
                var median = min.add(diff.scale(0.5));

                var worldMatrix = Matrix.Scaling(diff.x, diff.y, diff.z)
                    .multiply(Matrix.Translation(median.x, median.y, median.z))
                    .multiply(boundingBox.getWorldMatrix());

                // VBOs
                engine.bindBuffers(this._vertexBuffers, this._indexBuffer, this._colorShader.getEffect());

                // Front
                engine.setDepthFunctionToLess();
                this._scene.resetCachedMaterial();
                this._colorShader.bind(worldMatrix);
                this._colorShader.setColor4("color", BABYLON.Color4.FromArray([0, 0, 0, 0]));

                // Draw order
                var query = engine._gl.createQuery();
                engine._gl.beginQuery(engine._gl.ANY_SAMPLES_PASSED, query);
                engine._gl.drawElements(engine._gl.TRIANGLES, 36, engine._uintIndicesCurrentlySet ? engine._gl.UNSIGNED_INT : engine._gl.UNSIGNED_SHORT, 0);
                engine._gl.endQuery(engine._gl.ANY_SAMPLES_PASSED);

                tick(sm[boundingBoxIndex], engine._gl, query);
            }

            this._colorShader.unbind();
            engine.setDepthFunctionToLessOrEqual();
            engine.setDepthWrite(true);
        }

        /**
         * Build in function which can be applied to ensure meshes of a special queue (opaque, alpha test, transparent)
         * are rendered back to front if in the same alpha index.
         *
         * @param a The first submesh
         * @param b The second submesh
         * @returns The result of the comparison
         */
        public static defaultTransparentSortCompare(a: SubMesh, b:SubMesh) : number {
            // Alpha index first
            if (a._alphaIndex > b._alphaIndex) {
                return 1;
            }
            if (a._alphaIndex < b._alphaIndex) {
                return -1;
            }

            // Then distance to camera
            return RenderingGroup.backToFrontSortCompare(a, b);
        }

        /**
         * Build in function which can be applied to ensure meshes of a special queue (opaque, alpha test, transparent)
         * are rendered back to front.
         *
         * @param a The first submesh
         * @param b The second submesh
         * @returns The result of the comparison
         */
        public static backToFrontSortCompare(a: SubMesh, b:SubMesh) : number {
            // Then distance to camera
            if (a._distanceToCamera < b._distanceToCamera) {
                return 1;
            }
            if (a._distanceToCamera > b._distanceToCamera) {
                return -1;
            }

            return 0;
        }

        /**
         * Build in function which can be applied to ensure meshes of a special queue (opaque, alpha test, transparent)
         * are rendered front to back (prevent overdraw).
         *
         * @param a The first submesh
         * @param b The second submesh
         * @returns The result of the comparison
         */
        public static frontToBackSortCompare(a: SubMesh, b:SubMesh) : number {
            // Then distance to camera
            if (a._distanceToCamera < b._distanceToCamera) {
                return -1;
            }
            if (a._distanceToCamera > b._distanceToCamera) {
                return 1;
            }

            return 0;
        }

        /**
         * Resets the different lists of submeshes to prepare a new frame.
         */
        public prepare(): void {
            this._opaqueSubMeshes.reset();
            this._transparentSubMeshes.reset();
            this._alphaTestSubMeshes.reset();
            this._particleSystems.reset();
            this._spriteManagers.reset();
        }

        public dispose(): void {
            this._opaqueSubMeshes.dispose();
            this._transparentSubMeshes.dispose();
            this._alphaTestSubMeshes.dispose();
            this._particleSystems.dispose();
            this._spriteManagers.dispose();
        }

        /**
         * Inserts the submesh in its correct queue depending on its material.
         * @param subMesh The submesh to dispatch
         */
        public dispatch(subMesh: SubMesh): void {
            var material = subMesh.getMaterial();
            var mesh = subMesh.getMesh();

            if (material.needAlphaBlending() || mesh.visibility < 1.0 || mesh.hasVertexAlpha) { // Transparent
                this._transparentSubMeshes.push(subMesh);
            } else if (material.needAlphaTesting()) { // Alpha test
                this._alphaTestSubMeshes.push(subMesh);
            } else {
                this._opaqueSubMeshes.push(subMesh); // Opaque
            }
        }

        public dispatchSprites(spriteManager: SpriteManager) {
            this._spriteManagers.push(spriteManager);
        }

        public dispatchParticles(particleSystem: ParticleSystem) {
            this._particleSystems.push(particleSystem);
        }

        private _renderParticles(activeMeshes: AbstractMesh[]): void {
            if (this._particleSystems.length === 0) {
                return;
            }

            // Particles
            var activeCamera = this._scene.activeCamera;
            this._scene._particlesDuration.beginMonitoring();
            for (var particleIndex = 0; particleIndex < this._scene._activeParticleSystems.length; particleIndex++) {
                var particleSystem = this._scene._activeParticleSystems.data[particleIndex];

                if ((activeCamera.layerMask & particleSystem.layerMask) === 0) {
                    continue;
                }
                if (!particleSystem.emitter.position || !activeMeshes || activeMeshes.indexOf(particleSystem.emitter) !== -1) {
                    this._scene._activeParticles.addCount(particleSystem.render(), false);
                }
            }
            this._scene._particlesDuration.endMonitoring(false);
        }

        private _renderSprites(): void {
            if (!this._scene.spritesEnabled || this._spriteManagers.length === 0) {
                return;
            }

            // Sprites
            var activeCamera = this._scene.activeCamera;
            this._scene._spritesDuration.beginMonitoring();
            for (var id = 0; id < this._spriteManagers.length; id++) {
                var spriteManager = this._spriteManagers.data[id];

                if (((activeCamera.layerMask & spriteManager.layerMask) !== 0)) {
                    spriteManager.render();
                }
            }
            this._scene._spritesDuration.endMonitoring(false);
        }
    }
}
