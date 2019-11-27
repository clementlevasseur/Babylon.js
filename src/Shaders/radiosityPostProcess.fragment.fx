﻿// Attributes
in vec2 vUV;
uniform sampler2D inputTexture;
uniform float _ExposureAdjustment;

float Luminance(vec3 c)
{
    return dot(c, vec3(0.22, 0.707, 0.071));
}

void main(void) {
	vec3 colour = texture2D(inputTexture, vUV).rgb;

	float lum = Luminance(colour.rgb); 
	float lumTm = lum * _ExposureAdjustment;
	float scale = lumTm / (1.0 + lumTm);  

	colour *= scale / lum;
	gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
}