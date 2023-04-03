module.exports = {
    manifestFile: 'manifest.yaml',
    rpManifestFile: '.release-please-manifest.json',
    overrideKey: 'override',
    workflowTopics: {
        library: ['library', 'package'],
        helmRelease: ['helm-release'],
        container: ['container-image', 'docker-image', 'admission-controller'],
        go: ['vault-plugin'],
        cloudfront: ['website', 'reactjs-app'],
        luarock: ['kong-plugin']
    },
};
