// Load .env file for local testing
const dotenv = require('dotenv').config();
require('dotenv-expand').expand(dotenv)

const core = require('@actions/core');
const artifact = require('@actions/artifact');
const fs = require('fs');
const yaml = require('yaml');
const config = require('./config.js');
const process = require('process');
const artifactClient = artifact.create();

function getWorkflowFromTopics(topics) {

    let topicMatches = [];
    let workflow;

    Object.keys(config.workflowTopics).forEach(k => {
        let matches = config.workflowTopics[k].filter(v => topics.includes(v))
        topicMatches = topicMatches.concat(matches)
        if (matches.length === 1) workflow = k
    })

    if (topicMatches.length === 1) {
        return workflow;
    } else if (topicMatches.length === 0) {
        core.setFailed('project missing workflow topic');
    } else {
        core.setFailed('project has multiple workflow topics [' + topicMatches.join(' ') + ']');
    }

}


async function main() {

    const rolePaths = yaml.parse(core.getInput('vault_k8s_role_paths'));
    const event = yaml.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf-8'))
    const workspace = process.env.GITHUB_WORKSPACE
    const workflow = getWorkflowFromTopics(event.repository.topics)
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
        core.setOutput('VAULT_K8S_ROLE_PATH', rolePaths[manifest['environment']])
    }

    if (workflow === 'cloudfront') {
        metadata.ARTIFACT_NAME = `${event.repository.name}-${version}.tar.gz`
        metadata.VAULT_AWS_ROLE_PATH = manifest['cloudfront']['aws_role_path']
        metadata.DISTRIBUTION_ID = manifest['cloudfront']['distribution_id'];
        metadata.BUCKET = manifest['cloudfront']['bucket'];
        metadata.CUSTOM_TYPES = JSON.stringify(manifest['cloudfront']['custom_types'] ?? '[]');
    }

    if (workflow === 'container') {
        metadata.DOCKER_REPOSITORY = `ghcr.io/${event.repository.full_name}`;
    }

    if (workflow === 'go') {
        metadata.GO_APP_NAME = event.repository.name
        metadata.GO_MAIN_FILE = "main.go"
        metadata.GO_BUILDER_IMAGE = manifest["go"]["builder_image"]
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