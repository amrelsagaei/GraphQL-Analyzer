<script setup lang="ts">
import Button from "primevue/button";

import { useSDK } from "@/plugins/sdk";

const sdk = useSDK();

const copyToClipboard = async (text: string, successMessage: string) => {
  try {
    await navigator.clipboard.writeText(text);
    sdk.window.showToast(successMessage, { variant: "success" });
  } catch (error) {
    sdk.window.showToast("Failed to copy to clipboard", { variant: "error" });
  }
};

const copyGitHubUrl = () => {
  copyToClipboard(
    "https://github.com/caido-community/GraphQL-Analyzer",
    "GitHub URL copied successfully!",
  );
};

const copyAuthorWebsite = () => {
  copyToClipboard(
    "https://amrelsagaei.com",
    "Website link copied successfully!",
  );
};

const copyAuthorEmail = () => {
  copyToClipboard("info@amrelsagaei.com", "Email copied successfully!");
};

const copyTwitter = () => {
  copyToClipboard(
    "https://x.com/amrelsagaei",
    "X profile copied successfully!",
  );
};
</script>

<template>
  <div class="max-w-3xl space-y-12 pb-[36rem]">
    <section id="getting-started">
      <h2 class="text-2xl font-semibold mb-4">Getting Started</h2>
      <p class="text-surface-300 leading-relaxed mb-4">
        Start by scanning a GraphQL request or endpoint, importing an existing
        introspection result, or opening an endpoint directly in the Attacks
        tab.
      </p>

      <div class="space-y-4">
        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-3">Discover a Live Schema</h3>
          <p class="text-surface-300 leading-relaxed mb-3">
            Scan an existing request or enter an endpoint manually:
          </p>
          <ol class="list-decimal list-inside space-y-2 text-surface-300 ml-4">
            <li>
              Right-click a GraphQL request and select
              <strong>Scan GraphQL Endpoint</strong>, or enter its URL and
              headers on the Dashboard
            </li>
            <li>Wait for the introspection scan to finish</li>
            <li>
              Browse the queries, mutations, subscriptions, types, enums, and
              points of interest in Explorer
            </li>
            <li>Use the Voyager tab to visualize schema relationships</li>
          </ol>
        </div>

        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-3">Import a Saved Schema</h3>
          <p class="text-surface-300 leading-relaxed mb-3">
            If you already have a GraphQL introspection response, select
            <strong>Import Schema</strong> on the Dashboard and choose or drop
            the JSON file. Imported schemas are available in Explorer and
            Voyager without contacting an endpoint.
          </p>
        </div>

        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-3">Run Security Tests</h3>
          <p class="text-surface-300 leading-relaxed mb-3">
            To test a GraphQL endpoint for security vulnerabilities:
          </p>
          <ol class="list-decimal list-inside space-y-2 text-surface-300 ml-4">
            <li>
              Right-click a request and select
              <strong>Attack GraphQL Endpoint</strong>
            </li>
            <li>Configure your attack parameters in the Attacks tab</li>
            <li>Review findings and export results to Caido Replay</li>
          </ol>
          <p class="text-surface-300 text-sm mt-3">
            You can also target a custom URL or a previously scanned session
            from the Attacks tab.
          </p>
        </div>
      </div>
    </section>

    <section id="graphql-view-mode">
      <h2 class="text-2xl font-semibold mb-4">GraphQL View Mode</h2>
      <p class="text-surface-300 leading-relaxed mb-6">
        GraphQL Analyzer adds a GraphQL view mode to supported Caido request
        editors. It separates the operation into Query, Variables, and Request
        Info tabs so the request is easier to inspect and edit.
      </p>

      <div class="space-y-4">
        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-2">Add an Introspection Query</h3>
          <p class="text-surface-300 leading-relaxed mb-3">
            In an editable Replay request, click the
            <strong>magic-wand icon</strong> with the
            <strong>Add introspection query</strong> tooltip. The plugin fills
            the Query tab with the standard introspection operation, sets the
            operation name, and resets Variables to an empty object. Send the
            edited request from Replay to retrieve the schema.
          </p>
          <p class="text-surface-300 text-sm">
            The wand is only shown when the current request is editable. It does
            not appear in read-only request views or for persisted queries that
            do not include their operation text.
          </p>
        </div>

        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-2">View Mode Actions</h3>
          <ul class="list-disc list-inside space-y-2 text-surface-300 ml-4">
            <li><strong>Copy:</strong> Copy the current GraphQL query</li>
            <li>
              <strong>Shield:</strong> Open the request in the Attacks tab
            </li>
            <li>
              <strong>Send to Scanner:</strong> Scan the current request and add
              its introspection schema to Explorer
            </li>
          </ul>
        </div>
      </div>
    </section>

    <section id="schema-discovery">
      <h2 class="text-2xl font-semibold mb-4">Schema Discovery</h2>
      <p class="text-surface-300 leading-relaxed mb-6">
        Successful scans and imports create sessions in Explorer, where you can
        inspect the schema and generate operations for individual fields.
      </p>

      <div class="space-y-4">
        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-2">Schema Introspection</h3>
          <p class="text-surface-300 leading-relaxed mb-3">
            GraphQL Analyzer automatically performs introspection queries to
            discover the complete schema structure. This reveals:
          </p>
          <ul class="list-disc list-inside space-y-1 text-surface-300 ml-4">
            <li>All available queries, mutations, and subscriptions</li>
            <li>Field types, arguments, and documentation</li>
            <li>Custom scalar types and enums</li>
            <li>Input types and their relationships</li>
          </ul>
        </div>

        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-2">
            Importing Introspection JSON
          </h3>
          <ol class="list-decimal list-inside space-y-2 text-surface-300 ml-4">
            <li>Select <strong>Import Schema</strong> on the Dashboard</li>
            <li>Browse for a JSON file or drag it into the upload area</li>
            <li>
              Select <strong>Import</strong> and wait for processing to finish
            </li>
            <li>Open the imported session in Explorer or Voyager</li>
          </ol>
          <p class="text-surface-300 text-sm mt-3">
            Supported files include a complete GraphQL response shaped as
            <code>{ data: { __schema: ... } }</code>, an object containing
            <code>{ __schema: ... }</code>, or the direct introspection schema
            object containing <code>types</code>.
          </p>
          <p class="text-surface-300 text-sm mt-3">
            Imported schemas have no originating HTTP request. You can explore,
            copy, and visualize them, but the Send to Replay and Send to
            Attacker actions remain disabled.
          </p>
        </div>

        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-2">Explorer Actions</h3>
          <p class="text-surface-300 leading-relaxed mb-3">
            Select a query, mutation, or subscription in the schema tree to
            generate an operation. Required arguments are added as variable
            placeholders, and the maximum generated nesting depth can be changed
            in Settings.
          </p>
          <ul class="list-disc list-inside space-y-2 text-surface-300 ml-4">
            <li>
              <strong>Paper-plane icon — Send to Replay:</strong> Create a
              Replay session from the original scanned request with its body
              replaced by the generated operation and variables
            </li>
            <li>
              <strong>Shield icon — Send to Attacker:</strong> Open the source
              request in the Attacks tab
            </li>
            <li>
              <strong>Diagram icon — View in Voyager:</strong> Open the selected
              schema as an interactive graph
            </li>
            <li>
              <strong>Copy icon:</strong> Copy the displayed operation or data
            </li>
          </ul>
        </div>

        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-2">Session Management</h3>
          <p class="text-surface-300 leading-relaxed mb-3">
            Each discovered endpoint creates a session tab that you can:
          </p>
          <ul class="list-disc list-inside space-y-1 text-surface-300 ml-4">
            <li>Rename by double-clicking or right-clicking the tab name</li>
            <li>Delete by right-clicking and selecting delete</li>
            <li>Switch between sessions to compare different schemas</li>
          </ul>
          <p class="text-surface-300 text-sm mt-3">
            Sessions are saved in plugin storage and restored when Caido
            restarts.
          </p>
        </div>
      </div>
    </section>

    <section id="schema-visualization">
      <h2 class="text-2xl font-semibold mb-4">Schema Visualization</h2>
      <p class="text-surface-300 leading-relaxed mb-6">
        The Voyager tab provides an interactive graph visualization of your
        GraphQL schema, making it easy to understand complex relationships.
      </p>

      <div class="space-y-4">
        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-2">Navigation and Interaction</h3>
          <p class="text-surface-300 leading-relaxed mb-3">
            The graph interface allows you to:
          </p>
          <ul class="list-disc list-inside space-y-1 text-surface-300 ml-4">
            <li>Zoom in and out to focus on specific areas</li>
            <li>Pan around to explore large schemas</li>
            <li>Search and focus nodes from the schema navigation sidebar</li>
            <li>Use the minimap to move quickly across a large graph</li>
            <li>
              Click a node to highlight its parent chain and related connections
            </li>
            <li>Hover over a node to see its type and field count</li>
          </ul>
        </div>

        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-2">Understanding the Graph</h3>
          <p class="text-surface-300 leading-relaxed mb-3">
            The visualization shows:
          </p>
          <ul class="list-disc list-inside space-y-1 text-surface-300 ml-4">
            <li>
              Types as nodes with different colors for queries, mutations,
              subscriptions, objects, and enums
            </li>
            <li>Relationships as connecting lines between types</li>
            <li>Field names and return types when zoomed in</li>
          </ul>
          <p class="text-surface-300 text-sm mt-3">
            You must have at least one session in Explorer before using Voyager.
            Select a session to visualize its schema.
          </p>
        </div>
      </div>
    </section>

    <section id="security-testing">
      <h2 class="text-2xl font-semibold mb-4">Security Testing</h2>
      <p class="text-surface-300 leading-relaxed mb-6">
        The Attacks tab provides comprehensive security testing for GraphQL
        endpoints. Here's how to conduct effective security assessments:
      </p>

      <div class="space-y-4">
        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-2">Available Attack Types</h3>
          <ul class="list-disc list-inside space-y-2 text-surface-300 ml-4">
            <li>
              <strong>Schema Introspection:</strong> Tests if introspection is
              enabled (security risk if exposed in production)
            </li>
            <li>
              <strong>Query Depth Limit:</strong> Attempts deeply nested queries
              to test depth restrictions
            </li>
            <li>
              <strong>Query Complexity:</strong> Tests for query complexity
              analysis and limits
            </li>
            <li>
              <strong>Batch Query Limit:</strong> Sends multiple queries in
              batches to test rate limiting
            </li>
            <li>
              <strong>Field Suggestion:</strong> Tests if error messages reveal
              schema information
            </li>
          </ul>
        </div>

        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-2">Attack Configuration</h3>
          <p class="text-surface-300 leading-relaxed mb-3">
            Before running attacks, configure:
          </p>
          <ul class="list-disc list-inside space-y-1 text-surface-300 ml-4">
            <li>Maximum query depth for testing (default: 10)</li>
            <li>Batch size for batch query tests (default: 10)</li>
            <li>Custom headers for authentication</li>
            <li>Target endpoint (from context menu, URL, or session)</li>
          </ul>
          <p class="text-surface-300 text-sm mt-3">
            Only test endpoints you own or have explicit permission to test.
            Attacks run in the background, allowing navigation to other tabs.
          </p>
        </div>
      </div>
    </section>

    <section id="attack-results">
      <h2 class="text-2xl font-semibold mb-4">Attack Results</h2>
      <p class="text-surface-300 leading-relaxed mb-6">
        After running security tests, the results table provides detailed
        information about findings and allows you to take action on discovered
        vulnerabilities.
      </p>

      <div class="space-y-4">
        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-2">Results Table</h3>
          <p class="text-surface-300 leading-relaxed mb-3">
            The findings table shows:
          </p>
          <ul class="list-disc list-inside space-y-1 text-surface-300 ml-4">
            <li>Attack type and target URL</li>
            <li>HTTP status codes and response timing</li>
            <li>Number of findings with severity indicators</li>
            <li>High-severity finding counts for quick prioritization</li>
          </ul>
        </div>

        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-2">Available Actions</h3>
          <p class="text-surface-300 leading-relaxed mb-3">
            For each result, you can:
          </p>
          <ul class="list-disc list-inside space-y-1 text-surface-300 ml-4">
            <li>
              <strong>Replay Button (🔄):</strong> Send the request to Caido
              Replay for manual testing
            </li>
            <li>
              <strong>Create Finding (+):</strong> Add the finding to Caido's
              findings database
            </li>
            <li>
              <strong>Select a result row:</strong> Examine its payload,
              response, and finding details
            </li>
          </ul>
        </div>
      </div>
    </section>

    <section id="advanced-features">
      <h2 class="text-2xl font-semibold mb-4">Advanced Features</h2>
      <p class="text-surface-300 leading-relaxed mb-6">
        GraphQL Analyzer includes several advanced features for power users and
        complex testing scenarios.
      </p>

      <div class="space-y-4">
        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-2">Context Menu Integration</h3>
          <p class="text-surface-300 leading-relaxed mb-3">
            Right-click any request in Caido to access:
          </p>
          <ul class="list-disc list-inside space-y-1 text-surface-300 ml-4">
            <li>Quick scan to Explorer for schema discovery</li>
            <li>Direct attack launch with pre-filled request data</li>
            <li>GraphQL request view mode across supported Caido tools</li>
          </ul>
        </div>

        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-2">Session Management</h3>
          <p class="text-surface-300 leading-relaxed mb-3">
            Advanced session features include:
          </p>
          <ul class="list-disc list-inside space-y-1 text-surface-300 ml-4">
            <li>Multiple concurrent attack sessions</li>
            <li>Session history and result persistence</li>
            <li>Cross-tab data sharing between Explorer and Attacks</li>
            <li>Automatic session restoration on restart</li>
          </ul>
        </div>

        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-2">Integration with Caido</h3>
          <p class="text-surface-300 leading-relaxed mb-3">
            Seamless integration includes:
          </p>
          <ul class="list-disc list-inside space-y-1 text-surface-300 ml-4">
            <li>Export findings to Caido's findings system</li>
            <li>
              Send generated Explorer operations and attack requests to Replay
            </li>
            <li>
              Import saved introspection JSON without contacting an endpoint
            </li>
            <li>Custom header support for authentication</li>
            <li>Background processing without blocking the UI</li>
          </ul>
          <p class="text-surface-300 text-sm mt-3">
            GraphQL Analyzer is optimized for minimal impact on Caido's
            performance, even during intensive testing.
          </p>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <section id="footer" class="pt-8 border-t border-surface-700">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <span class="text-sm text-surface-400">GraphQL Analyzer</span>
          <Button
            icon="fab fa-github"
            label="Star on GitHub"
            severity="secondary"
            outlined
            size="small"
            @click="copyGitHubUrl"
          />
        </div>
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <span class="text-xs text-surface-500"
              >Made with <i class="fas fa-heart text-red-400"></i> by</span
            >
            <button
              class="text-xs text-primary-400 hover:text-primary-300 transition-colors cursor-pointer font-medium"
              @click="copyAuthorWebsite"
            >
              Amr Elsagaei
            </button>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="text-xs text-surface-400 hover:text-primary-400 transition-colors cursor-pointer flex items-center gap-1"
              @click="copyAuthorEmail"
            >
              <i class="fas fa-envelope"></i>
              <span>Email</span>
            </button>
            <button
              class="text-xs text-surface-400 hover:text-primary-400 transition-colors cursor-pointer flex items-center gap-1"
              @click="copyTwitter"
            >
              <i class="fab fa-x-twitter"></i>
              <span>Twitter</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
