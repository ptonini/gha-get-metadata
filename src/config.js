module.exports = {
    manifestFile: 'manifest.yaml',
    rpManifestFile: '.release-please-manifest.json',
    overrideKey: 'override',
    workflowTopics: {
        library: ['library', 'package'],
        helmRelease: ['helm-release'],
        docker: ['docker-image', 'admission-controller'],
        go: ['vault-plugin'],
        cloudfront: ['website', 'reactjs-app'],
        luarock: ['kong-plugin']
    },
};
