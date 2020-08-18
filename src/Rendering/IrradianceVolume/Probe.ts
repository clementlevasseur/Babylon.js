import { Mesh } from "../../Meshes/mesh";
import { Vector3, Matrix } from '../../Maths/math.vector';
import { Scene } from '../../scene';
import { Color4 } from '../../Maths/math.color';
import { InternalTexture } from '../../Materials/Textures/internalTexture';
import { SubMesh } from '../../Meshes/subMesh';
import { Material } from '../../Materials/material';
import { Effect } from '../../Materials/effect';
import { SmartArray } from '../../Misc/smartArray';
import { UniversalCamera } from '../../Cameras/universalCamera';
import { CubeMapToSphericalPolynomialTools } from '../../Misc/HighDynamicRange/cubemapToSphericalPolynomial';
import { SphericalHarmonics } from '../../Maths/sphericalPolynomial';
import { ShaderMaterial } from '../../Materials/shaderMaterial';
import { RenderTargetTexture } from '../../Materials/Textures/renderTargetTexture';

import "../../Shaders/irradianceVolumeProbeEnv.vertex";
import "../../Shaders/irradianceVolumeProbeEnv.fragment";
import "../../Shaders/irradianceVolumeUpdateProbeBounceEnv.vertex";
import "../../Shaders/irradianceVolumeUpdateProbeBounceEnv.fragment";
import "../../Shaders/irradianceVolumeComputeIrradiance.fragment";
import "../../Shaders/irradianceVolumeComputeIrradiance.vertex";
import { PBRMaterial } from '../../Materials/PBR/pbrMaterial';

import { MeshDictionary } from './meshDictionary';
import { Constants } from '../../Engines/constants';
import { TransformNode } from '../../Meshes/transformNode';

/**
 * The probe is what is used for irradiance volume
 * It aims to sample the irradiance at  a certain point of the scene
 * For that, it create a cube map of its environment that will be used to compute the irradiance at that point
 */
export class Probe {

    public static readonly OUTSIDE_HOUSE : number = 0;
    public static readonly INSIDE_HOUSE : number = 1;
    public static readonly RESOLUTION : number = 16;

    /**
     * Static number to access to the cameras with their direction
     */
    public static readonly PX : number = 0;
    public static readonly NX : number = 1;
    public static readonly PY : number = 2;
    public static readonly NY : number = 3;
    public static readonly PZ : number = 4;
    public static readonly NZ : number = 5;

    private _scene : Scene;

    /**
     * The list of camera that are attached to the probe,
     * used to render the cube map
     */
    public cameraList : Array<UniversalCamera>;

    public captureEnvironmentEffect : Effect;

    public position : Vector3;

    public transformNode : TransformNode;

    public dictionary : MeshDictionary;

    /**
     * The spherical harmonic coefficients that represent the irradiance capture by the probe
     */
    public sphericalHarmonic : SphericalHarmonics;

    /**
     * RenderTargetTexture that aims to copy the cubicMRT envCubeMap and add the irradiance compute previously to it, to simulate the bounces of the light
     */
    public environmentProbeTexture : RenderTargetTexture;

    /**
     * Variable helpful and use to know when the environment cube map has been rendered to continue the process
     */
    public envCubeMapRendered = false;

    public envMultiplicator = 1.3;

    public probeInHouse = Probe.OUTSIDE_HOUSE;

    public sphere : Mesh;

    /**
     * Create the probe used to capture the irradiance at a point
     * @param position The position at which the probe is set
     * @param scene the scene in which the probe is place
     * @param albedoName the path to the albedo
     */
    constructor(position : Vector3, scene : Scene, inRoom : number) {
        this._scene = scene;
        this.position = position;
        this.transformNode = new TransformNode("node", this._scene);
        this.probeInHouse = inRoom;
        this.cameraList = new Array<UniversalCamera>();

        //First Camera ( x axis )
        let cameraPX = new UniversalCamera("px", Vector3.Zero(), scene);
        cameraPX.rotation = new Vector3(0, Math.PI / 2, 0);
        this.cameraList.push(cameraPX);

        //Second Camera ( - x  axis )
        let cameraNX = new UniversalCamera("nx", Vector3.Zero(), scene);
        cameraNX.rotation = new Vector3(0, - Math.PI / 2, 0);
        this.cameraList.push(cameraNX);

        //Third Camera ( y axis )
        let cameraPY = new UniversalCamera("py", Vector3.Zero(), scene);
        cameraPY.rotation = new Vector3(Math.PI / 2, 0, 0);
        this.cameraList.push(cameraPY);

        //Fourth Camera ( - y axis )
        let cameraNY = new UniversalCamera("ny", Vector3.Zero(), scene);
        cameraNY.rotation = new Vector3(- Math.PI / 2, 0, 0);
        this.cameraList.push(cameraNY);

        //Fifth Camera ( z axis )
        let cameraPZ = new UniversalCamera("pz", Vector3.Zero(), scene);
        cameraPZ.rotation = new Vector3(0, 0, 0);
        this.cameraList.push(cameraPZ);

        //Sixth Camera ( - z axis )
        let cameraNZ = new UniversalCamera("nz", Vector3.Zero(), scene);
        cameraNZ.rotation = new Vector3(0, Math.PI, 0);
        this.cameraList.push(cameraNZ);

        //Change the attributes of all cameras
        for (let camera of this.cameraList) {
            camera.parent = this.transformNode;
        }

        this.transformNode.translate(position, 1);
        this.sphericalHarmonic = new SphericalHarmonics();
    }

    /**
     * Add a parent to the probe
     * @param parent The parent to be added
     */
    public setParent(parent : Mesh): void {
        this.transformNode.parent = parent;
    }

    protected _renderCubeTexture(subMeshes : SmartArray<SubMesh>) : void {

        var renderSubMesh = (subMesh : SubMesh, effect : Effect, view : Matrix, projection : Matrix ) => {
            let mesh = subMesh.getRenderingMesh();

            mesh._bind(subMesh, effect, Material.TriangleFillMode);
            mesh.cullingStrategy = 2;
            if (subMesh.verticesCount === 0) {
                return;
            }

            effect.setMatrix("view", view);
            effect.setMatrix("projection", projection);
            if (mesh.material != null) {
                let color = (<PBRMaterial> (mesh.material)).albedoColor;
                effect.setVector3("albedoColor", new Vector3(color.r, color.g, color.b));
                if ((<PBRMaterial> (mesh.material)).albedoTexture != null) {
                    effect.setBool("hasTexture", true);
                    effect.setTexture("albedoTexture", (<PBRMaterial> (mesh.material)).albedoTexture);
                }
                else {
                    effect.setBool("hasTexture", false);
                }
            }
            effect.setFloat("envMultiplicator", this.envMultiplicator);
            effect.setVector3("probePosition", this.position);
            let value = this.dictionary.getValue(mesh);
            if (value != null) {

                effect.setTexture("irradianceMap", value.postProcessLightmap.textures[0]);
                effect.setTexture("directIlluminationLightmap", value.directLightmap);
            }

            var batch = mesh._getInstancesRenderList(subMesh._id);
            if (batch.mustReturn) {
                return ;
            }
            var hardwareInstanceRendering = (engine.getCaps().instancedArrays) &&
            (batch.visibleInstances[subMesh._id] !== null);
            mesh._processRendering(mesh, subMesh, effect, Material.TriangleFillMode, batch, hardwareInstanceRendering,
                (isInstance, world) => effect.setMatrix("world", world));
        };

        let scene = this._scene;
        let engine = scene.getEngine();
        let gl = engine._gl;

        let internalTexture = <InternalTexture>this.environmentProbeTexture.getInternalTexture();
        let effect = this.captureEnvironmentEffect;

        gl.bindFramebuffer(gl.FRAMEBUFFER, internalTexture._framebuffer);
        engine.setState(false, 0, true, scene.useRightHandedSystem);

        let viewMatrices = [ this.cameraList[Probe.PX].getViewMatrix(),
            this.cameraList[Probe.NX].getViewMatrix(),
            this.cameraList[Probe.PY].getViewMatrix(),
            this.cameraList[Probe.NY].getViewMatrix(),
            this.cameraList[Probe.PZ].getViewMatrix(),
            this.cameraList[Probe.NZ].getViewMatrix()
        ];

        let projectionMatrix =  Matrix.PerspectiveFovLH(Math.PI / 2, 1, 0.1, this.cameraList[0].maxZ);

        let cubeSides = [
            gl.TEXTURE_CUBE_MAP_POSITIVE_X,
            gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
            gl.TEXTURE_CUBE_MAP_POSITIVE_Y,
            gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
            gl.TEXTURE_CUBE_MAP_POSITIVE_Z,
            gl.TEXTURE_CUBE_MAP_NEGATIVE_Z
        ];

        engine.enableEffect(effect);

        for (let j = 0; j < 6; j++) {
            engine.setDirectViewport(0, 0, this.environmentProbeTexture.getRenderWidth(), this.environmentProbeTexture.getRenderHeight());
            gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, cubeSides[j], internalTexture._webGLTexture, 0);

            engine.clear(new Color4(0, 0, 0, 0), true, true);
            for (let i = 0; i < subMeshes.length; i++) {
                renderSubMesh(subMeshes.data[i], effect, viewMatrices[j], projectionMatrix);
            }
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /**
     * Render the 6 cameras of the probes with different effect to create the cube map we need
     * @param meshes The meshes we want to render
     */
    public initForRendering(dictionary : MeshDictionary, captureEnvironmentEffect : Effect) : void {
        this.dictionary = dictionary;
        this.captureEnvironmentEffect = captureEnvironmentEffect;
    }

    /**
     * Render one bounce of the light from the point of view of a probe
     *
     * @param irradianceLightMap THe irradiance lightmap use to render the bounces
     */
    public renderBounce(meshes : Array<Mesh>) : void {
        if (this.probeInHouse == Probe.INSIDE_HOUSE) {
            this.environmentProbeTexture.renderList = meshes;
            this.environmentProbeTexture.boundingBoxPosition = this.position;

            this.environmentProbeTexture.onBeforeRenderObservable.add(() => {
                    this.environmentProbeTexture.isCube = false; 
            });
            this.environmentProbeTexture.customRenderFunction =  (opaqueSubMeshes: SmartArray<SubMesh>, alphaTestSubMeshes: SmartArray<SubMesh>, transparentSubMeshes: SmartArray<SubMesh>, depthOnlySubMeshes: SmartArray<SubMesh>): void => {
                    this._renderCubeTexture(opaqueSubMeshes);
            };
            this.environmentProbeTexture.onAfterRenderObservable.add(() => {  
                this.environmentProbeTexture.isCube = true;
                this._CPUcomputeSHCoeff();
            });
        }
    }

    /**
     * Initialise what need time to be ready
     * Is called in irradiance for the creation of the promise
     */
    public initPromise() : void {
        if (this.probeInHouse == Probe.INSIDE_HOUSE) {
            this.environmentProbeTexture = new RenderTargetTexture("tempLightBounce", Probe.RESOLUTION, this._scene, undefined, true, Constants.TEXTURETYPE_FLOAT, true);
        }
    }

    /**
     * Return if the probe is ready to be render
     */
    public isProbeReady() : boolean {
        if (this.probeInHouse == Probe.INSIDE_HOUSE) {
            return this._isEnvironmentProbeTextureReady();
        }
        return true;
    }

    private _isEnvironmentProbeTextureReady() : boolean {

        return this.environmentProbeTexture.isReady();
    }

    private _CPUcomputeSHCoeff() : void {

        let sp = CubeMapToSphericalPolynomialTools.ConvertCubeMapTextureToSphericalPolynomial(this.environmentProbeTexture);

        if (sp != null) {
            this.sphericalHarmonic = SphericalHarmonics.FromPolynomial(sp);
            this._weightSHCoeff();
        }
    }

    private _computeProbeIrradiance() : void {
        //We use a shader to add this texture to the probe
        let shaderMaterial = new ShaderMaterial("irradianceOnSphere", this._scene,  "irradianceVolumeComputeIrradiance", {
            attributes : ["position", "normal"],
            uniforms : ["worldViewProjection", "L00", "L10", "L11", "L1m1", "L20", "L21", "L22", "L2m1", "L2m2"]
        });
        shaderMaterial.setVector3("L00", this.sphericalHarmonic.l00);

        shaderMaterial.setVector3("L10", this.sphericalHarmonic.l10);
        shaderMaterial.setVector3("L11", this.sphericalHarmonic.l11);
        shaderMaterial.setVector3("L1m1", this.sphericalHarmonic.l1_1);

        shaderMaterial.setVector3("L20", this.sphericalHarmonic.l20);
        shaderMaterial.setVector3("L21", this.sphericalHarmonic.l21);
        shaderMaterial.setVector3("L22", this.sphericalHarmonic.l22);
        shaderMaterial.setVector3("L2m1", this.sphericalHarmonic.l2_1);
        shaderMaterial.setVector3("L2m2", this.sphericalHarmonic.l2_2);
        if (this.probeInHouse == 1) {
        this.sphere.material = shaderMaterial;
        }

    }

    public createSphere() : void {
        if (this.probeInHouse != Probe.OUTSIDE_HOUSE) {
            this.sphere = Mesh.CreateSphere("sphere", 32, 30, this._scene);
            this.sphere.position = this.position;
            this._computeProbeIrradiance();
        }
    }

    private _weightSHCoeff() {
        let weight = 0.1;
        this.sphericalHarmonic.l00 = this.sphericalHarmonic.l00.multiplyByFloats(weight, weight, weight);
        this.sphericalHarmonic.l10 = this.sphericalHarmonic.l10.multiplyByFloats(weight, weight, weight);
        this.sphericalHarmonic.l11 = this.sphericalHarmonic.l11.multiplyByFloats(weight, weight, weight);
        this.sphericalHarmonic.l1_1 = this.sphericalHarmonic.l1_1.multiplyByFloats(weight, weight, weight);
        this.sphericalHarmonic.l20 = this.sphericalHarmonic.l20.multiplyByFloats(weight, weight, weight);
        this.sphericalHarmonic.l21 = this.sphericalHarmonic.l21.multiplyByFloats(weight, weight, weight);
        this.sphericalHarmonic.l22 = this.sphericalHarmonic.l22.multiplyByFloats(weight, weight, weight);
        this.sphericalHarmonic.l2_1 = this.sphericalHarmonic.l2_1.multiplyByFloats(weight, weight, weight);
        this.sphericalHarmonic.l2_2 = this.sphericalHarmonic.l2_2.multiplyByFloats(weight, weight, weight);
    }

}
