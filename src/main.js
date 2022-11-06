// Load .env file for local testing
require('dotenv').config();

const core = require('@actions/core');
const artifact = require('@actions/artifact');
const fs = require('fs');
const yaml = require('yaml');
const config = require('./config.js');
const process = require('process');
const artifactClient = artifact.create();

function getWorkflow(type) {
    let workflow
    Object.keys(config.workflowTopics).forEach(k => {
        if (config.workflowTopics[k].includes(type)) {
            workflow = k
        }
    })
    return workflow
}

function aggregateTypes() {
    let classArray = [];
    Object.keys(config.workflowTopics).forEach(k => {
        classArray = classArray.concat(config.workflowTopics[k])
    })
    return classArray
}

function getMetadataFromTopics(label, types, topics, required) {
    let matches = types.filter(v => topics.includes(v))
    if (matches.length === 1) {
        return matches[0];
    } else if (matches.length === 0) {
        required && core.setFailed('project missing ' + label + ' topic');
        return ''
    } else {
        core.setFailed('project has multiple ' + label + ' topics [' + matches.join(' ') + ']');
    }
}


async function main() {

    const vaultK8sRolePaths = yaml.parse(core.getInput('vault_k8s_role_paths'));
    const event = yaml.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf-8'))
    const projectType = getMetadataFromTopics('type', aggregateTypes(), event.repository.topics, true)
    const workspace = process.env.GITHUB_WORKSPACE
    const workflow = getWorkflow(projectType)
    const metadata = {}

    let manifest = {}
    if (fs.existsSync(`${workspace}/${config.manifestFile}`)) {
        manifest = yaml.parse(fs.readFileSync(`${workspace}/${config.manifestFile}`, 'utf-8'))
    }

    let version = '0.0.0'
    if (fs.existsSync(`${workspace}/${config.rpManifestFile}`)) {
        version = yaml.parse(fs.readFileSync(`${workspace}/${config.rpManifestFile}`, 'utf-8'))['.']
    }
    core.setOutput('RELEASE_VERSION', version)

    if (workflow === 'helmRelease' || workflow === 'cloudfront') {
        core.setOutput('DOCKER_REPOSITORY', `${manifest['helm']['values']['image']['registry']}/${manifest['helm']['values']['image']['repository']}`)
        core.setOutput('VAULT_K8S_ROLE_PATH',vaultK8sRolePaths[manifest['environment']])
    }

    if (workflow === 'cloudfront') {
        metadata.ARTIFACT_NAME = `${event.repository.name}-${version}.tar.gz`
        metadata.VAULT_AWS_ROLE_PATH = manifest['cloudfront']['aws_role_path']
        metadata.DISTRIBUTION_ID = manifest['cloudfront']['distribution_id'];
        metadata.BUCKET = manifest['cloudfront']['bucket'];
        metadata.CUSTOM_TYPES = JSON.stringify(manifest['cloudfront']['custom_types'] ?? '[]');
    }

    if (workflow === 'docker') {
        metadata.DOCKER_REPOSITORY = `ghcr.io/${event.repository.full_name}`;
    }

    if (workflow === 'go') {
        metadata.GO_APP_NAME = event.repository.name
        metadata.GO_MAIN_FILE = "main.go"
        metadata.GO_BUILDER_IMAGE = manifest["go"]["builder_image"]
    }

    if (workflow === 'luarock') {
        metadata.PACKAGE_NAME = event.repository.name
        metadata.ROCK_PREFIX = `${event.repository.name}-${version}`
        metadata.ROCK_FILE = `${metadata.ROCK_PREFIX}-0.rockspec`
    }

    Object.keys(metadata).forEach(k => {
        core.setOutput(k.toLowerCase(), metadata[k])
        core.info(`${k}=${metadata[k]}`)
    })

    fs.writeFileSync('./metadata.json', JSON.stringify(metadata, null, 4));
    await artifactClient.uploadArtifact('metadata', ['metadata.json'], '.')

    fs.writeFileSync('./event.json', JSON.stringify(event, null, 4));
    await artifactClient.uploadArtifact('event', ['event.json'], '.')

}

main().catch(error => {
    core.setFailed(error)
});