module.exports = {
    overrideKey: 'override',
    workflowTopics: {
        library: ['library', 'package'],
        helmRelease: ['helm-release'],
        docker: ['docker-image'],
        go: ['vault-plugin'],
        cloudfront: ['website', 'react-app'],
        luarock: ['kong-plugin']
    },
    defaults: {
        MANIFEST_FILE: 'manifest.yaml',
        RP_MANIFEST_FILE: '.release-please-manifest.json',
        PUBLISH_CANDIDATE: false,
        APPROVE_CANDIDATE: false,
        PROMOTE_CANDIDATE: false,
        CREATE_STAGING: false,
        DESTROY_STAGING: false,
        HOUSEKEEPING: false,
        REPORTS_FOLDER: "reports",
        GO_COVERAGE_PROFILE: "coverage.out",
        GO_TEST_REPORT: "report.out",
        PYTHON_COVERAGE_REPORT: "*coverage-*.xml",
        PYTHON_XUNIT_REPORT: "xunit-result-*.xml",
        JAVASCRIPT_LCOV_INFO: "lcov.info",
        HELM_SECRET_CHART: 'secret',
        HELM_SECRET_CHART_VERSION: '^2.0.0',
        HELM_REPOSITORY: 'https://charts.nodis.com.br'
    }
};
