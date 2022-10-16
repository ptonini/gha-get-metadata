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
    Object.keys(config.workflowTopics).forEach(k => {classArray = classArray.concat(config.workflowTopics[k])})
    return classArray
}

function getMetadataFromTopics(label, types, topics, required) {
    let matches = [];
    for (const t of topics) {
        if (Array.isArray(types)) types.includes(t) && matches.push(t);
        else t in types && matches.push(t);
    }
    if (matches.length === 1) {
        return matches[0];
    } else if (matches.length === 0) {
        required && core.setFailed('project missing ' + label + ' topic');
    }
    else {
        core.setFailed('project has multiple ' + label + ' topics [' + matches.join(' ') + ']');
    }
}

async function main() {

    const orgConfig = yaml.parse(core.getInput('org_config'));
    const event = yaml.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf-8'))
    const projectType = getMetadataFromTopics('type', aggregateTypes(), event.repository.topics, true)
    const workflow = getWorkflow(projectType)

    const metadata = {...config.defaults}
    const manifest = yaml.parse(fs.readFileSync(`${process.env.GITHUB_WORKSPACE}/${metadata.MANIFEST_FILE}`, 'utf-8'))
    const {'.': version } = yaml.parse(fs.readFileSync(`${process.env.GITHUB_WORKSPACE}/${metadata.RP_MANIFEST_FILE}`, 'utf-8'))

    metadata.SKIP_TESTS = manifest['skip_tests'] === true
    metadata.RELEASE_VERSION = version

    if (process.env.GITHUB_EVENT_NAME === 'pull_request' && ['opened', 'synchronize'].includes(event.action)) {
        metadata.PUBLISH_CANDIDATE = true
        metadata.HOUSEKEEPING = !(manifest['skip_housekeeping'] === true)
    }
    if (process.env.GITHUB_EVENT_NAME === 'pull_request' && event.action === 'closed') {
        metadata.APPROVE_CANDIDATE = event.pull_request.merged
        metadata.HOUSEKEEPING = false
        metadata.SKIP_TESTS = true
    }
    if (process.env.GITHUB_EVENT_NAME === 'push' && event.head_commit.message.includes(`chore(${event.repository.default_branch}): release`)) {
        metadata.PROMOTE_CANDIDATE = true
        metadata.HOUSEKEEPING = false
        metadata.SKIP_TESTS = true
    }

    if (['helmRelease', 'cloudfront'].includes(workflow)) {
        const imagePullSecret = manifest['helm']['values']['imagePullSecrets'][0]
        metadata.APP_GROUP = getMetadataFromTopics('app', orgConfig.apps, event.repository.topics)
        metadata.DOCKER_REPOSITORY = `${manifest['helm']['values']['image']['registry']}/${manifest['helm']['values']['image']['repository']}`
        metadata.IMAGE_PULL_SECRET = imagePullSecret
        metadata.VAULT_REGISTRY_CREDENTIALS_PATH = orgConfig['registry_credentials'][imagePullSecret]
        metadata.VAULT_GITHUB_TOKEN_PATH = orgConfig['github_token_path']
        metadata.INGRESS_CONFIG_REPOSITORY = orgConfig['ingress_config_repository']
        metadata.PRD_NAMESPACE = manifest['helm']['namespace']
        metadata.PRD_ENVIRONMENT = manifest['environment']
        metadata.INGRESS_PATH = `${manifest['helm']['namespace']}/${manifest['environment']}`
        if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
            const environment = orgConfig['staging_environment']
            const releaseName = manifest['helm']['release_name']
            metadata.VAULT_K8S_ROLE_PATH = orgConfig['environments'][environment]['k8s_role_path']
            metadata.CREATE_STAGING = !(manifest['skip_staging'] === true)
            metadata.STAGING_DOMAIN = `${event.number}.${releaseName}.${environment}.${orgConfig['route53']['domain']}`
            metadata.NAMESPACE = `${releaseName}-${event.number}`
            if (metadata.CREATE_STAGING && metadata.PUBLISH_CANDIDATE) {
                metadata.ENVIRONMENT = environment
                metadata.HELM_EXTRA_ARGUMENTS = '--create-namespace'
            }
            if (metadata.CREATE_STAGING && event.action === 'closed' ) {
                metadata.DESTROY_STAGING = true
                metadata.VAULT_AWS_ROLE_PATH = orgConfig['route53']['aws_role_path']
                metadata.ROUTE53_ZONE_ID = orgConfig['route53']['zone_id']
            }
        }
        if (['workflow_dispatch', 'push'].includes(process.env.GITHUB_EVENT_NAME)) {
            if (workflow === 'helmRelease') {
                const environment = manifest['environment']
                metadata.VAULT_K8S_ROLE_PATH = orgConfig['environments'][environment]['k8s_role_path']
                metadata.ENVIRONMENT = environment
                metadata.NAMESPACE = manifest['helm']['namespace']
            }
            if (workflow === 'cloudfront') {
                metadata.ARTIFACT_NAME = `${event.repository.name}-${version}.tar.gz`
                metadata.VAULT_AWS_ROLE_PATH = manifest['cloudfront']['aws_role_path']
                metadata.DISTRIBUTION_ID = manifest['cloudfront']['distribution_id'];
                metadata.BUCKET = manifest['cloudfront']['bucket'];
                metadata.CUSTOM_TYPES = JSON.stringify(manifest['cloudfront']['custom_types'] ?? '[]');
            }
        }
    }

    if (workflow === 'docker') {
        metadata.DOCKER_REPOSITORY = manifest['docker']['image_name'];
    }

    if (workflow === 'go') {
        metadata.GO_APP_NAME = manifest['go']['app_name'] ?? event.repository.name
        metadata.GO_BUILDER_IMAGE = manifest["go"]["builder_image"]
        metadata.GO_MAIN_FILE = manifest["go"]["main_file"]
    }

    if (workflow === 'luarock') {
        metadata.PACKAGE_NAME = event.repository.name
        metadata.ROCK_PREFIX = `${event.repository.name }-${version}`
        metadata.ROCK_FILE = `${metadata.ROCK_PREFIX}-0.rockspec`
    }

    Object.keys(metadata).forEach(k => {core.setOutput(k.toLowerCase(), metadata[k])})
    const encodedMetadata = JSON.stringify(metadata, null, 4)
    core.info(encodedMetadata);
    fs.writeFileSync('./metadata.json', encodedMetadata);
    await artifactClient.uploadArtifact('metadata', ['metadata.json'], '.')
}

main().catch(error => {core.setFailed(error)});