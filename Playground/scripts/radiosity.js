﻿// In this example, the radiosity renderer is run for 2 ms after each frame
// We are seeing the illumination slowly converging over time to a solution
// You can also run it in one go, see below

var meshes = [];

let uvm = new BABYLON.UvMapper();

var prepareUVS = function(ms) {
    let geometryMeshes = [];
    for (let i = 0; i < ms.length; i++) {
        if (ms[i].getVerticesData(BABYLON.VertexBuffer.PositionKind) && geometryMeshes.indexOf(ms[i]) === -1) {
            geometryMeshes.push(ms[i]);
        }
    }

    // let worldToUVRatio = uvm.map(geometryMeshes);

    for (let i = 0; i < geometryMeshes.length; i++) {
        let mesh = geometryMeshes[i];
        if (!mesh.radiosityInfo) {
            mesh.initForRadiosity();
        }
        mesh.radiosityInfo.lightmapSize = mesh.radiosityInfo.lightmapSize || {
            width: 256,
            height: 256
        };
        let worldToUVRatio = uvm.map([mesh]);
        mesh.radiosityInfo.texelWorldSize = 1 / ( worldToUVRatio * mesh.radiosityInfo.lightmapSize.width);
        meshes.push(mesh);
    }
}

var addMaterial = function(mesh) {
    mesh.material = new BABYLON.StandardMaterial("placeholder", scene);
}

var addAreaLight = function(name, scaling) {
    var ground = BABYLON.Mesh.CreateGround(name, 6, 6, 1, scene);
    if (scaling) {
        ground.scaling = scaling;        
    }
    ground.initForRadiosity();
    ground.radiosityInfo.lightmapSize = {
        width: 16,
        height: 16
    };
    addMaterial(ground);
    prepareUVS([ground]);
    return ground;
}

var createScene = function() {
    var scene = new BABYLON.Scene(engine);
    var camera = new BABYLON.FreeCamera("camera1", new BABYLON.Vector3(0, 5, -10), scene);
    camera.position.copyFromFloats(9.200132469205137, 1.1758180989261708, -1.4947768829435397);
    camera.rotation.copyFromFloats(-0.16352062147076044, 4.820623367259722, 0);
    camera.attachControl(canvas, true);

    var light = new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.01;

    var areaLight = addAreaLight("areaLight", new BABYLON.Vector3(0.25, 0.25, 0.25));
    areaLight.rotation.x = -3 * Math.PI / 4;
    areaLight.position.copyFromFloats(-5, 15, 15);
    areaLight.radiosityInfo.color = new BABYLON.Vector3(2000, 2000, 2000);

    var pr;

    BABYLON.SceneLoader.ImportMesh(
        "",
        "",
        "scenes/openroom.babylon",
        scene,
        (ms) => {
            for (let i = 0; i < ms.length; i++) {
                if (!ms[i].parent) {
                    ms[i].rotation.x += Math.PI / 2
                    ms[i].computeWorldMatrix(true);
                }
                addMaterial(ms[i]);
            }
            prepareUVS(ms);

            pr = new BABYLON.RadiosityRenderer(scene, meshes, { near: 0.1, far: 150, bias: 5e-5, normalBias: 1e-10 });
            pr.createMaps();

            var wasPreviouslyReady = false;
            var observer = scene.onAfterRenderTargetsRenderObservable.add(() => {
                if (!pr.isReady()) {
                    return;
                }
                pr.gatherDirectLightOnly()

                if (!wasPreviouslyReady) {
                    for (let i = 0; i < meshes.length; i++) {
                        meshes[i].material.ambientTexture = meshes[i].getRadiosityTexture();
                        meshes[i].material.ambientTexture.coordinatesIndex = 1;
                    }
                    wasPreviouslyReady = true;
                }

                // if (!pr.gatherFor(2, 1)) { /* *** use pr.gatherRadiosity(16) for computing the solution all at once *** */
                console.log("Converged ! ");
                scene.onAfterRenderTargetsRenderObservable.remove(observer);
            });
        }
    );

    var renderLoop = function() {
        if (engine.scenes.length === 0) {
            return;
        }

        if (canvas.width !== canvas.clientWidth) {
            engine.resize();
        }

        var scene = engine.scenes[0];

        if (scene.activeCamera || scene.activeCameras.length > 0) {
            scene.render();
        }

        fpsLabel.style.right = document.body.clientWidth - (jsEditor.domElement.clientWidth + canvas.clientWidth) + "px";
        fpsLabel.innerHTML = engine.getFps().toFixed() + " fps";
    }

    return scene;
};