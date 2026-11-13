<script setup lang="ts">
import { schoolState } from "@/stores/school";
defineOptions({ name: "Home" });
const MusicHome = defineAsyncComponent(() => import("./MusicHome.vue"));
</script>

<template>
  <RequestHome v-if="schoolState.config.enabled && schoolState.config.searchHome" />
  <MusicHome v-else />
</template>
