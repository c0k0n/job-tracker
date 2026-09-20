<script lang="ts">
	import type { CurrencyCode } from '$lib/types';
	import { CURRENCIES } from '$lib/constants/currencies';
	import { SALARY_SHAPES, type SalaryShapeValue } from '$lib/utils/money';

	interface Props {
		shape: SalaryShapeValue;
		currency: CurrencyCode;
		exact: string;
		min: string;
		max: string;
		error?: string;
		inputClass: string;
	}

	let {
		shape = $bindable(),
		currency = $bindable(),
		exact = $bindable(),
		min = $bindable(),
		max = $bindable(),
		error,
		inputClass
	}: Props = $props();
</script>

<fieldset class="space-y-3">
	<legend class="text-sm font-medium text-fg">Salary</legend>
	<p class="text-xs text-muted">
		The pay this role offers or targets, if known. Optional — leave it as "Not specified".
	</p>

	<!-- Hidden inputs to submit values with parent FormData -->
	<input type="hidden" name="salaryShape" value={shape} />
	<input type="hidden" name="salaryCurrency" value={currency} />
	<input type="hidden" name="salaryExact" value={exact} />
	<input type="hidden" name="salaryMin" value={min} />
	<input type="hidden" name="salaryMax" value={max} />

	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
		<div class="space-y-1.5">
			<label
				for="app-salary-shape"
				class="block text-xs font-medium tracking-wide text-muted uppercase">Type</label
			>
			<select
				id="app-salary-shape"
				bind:value={shape}
				class={inputClass}
				aria-invalid={error ? 'true' : undefined}
				aria-describedby={error ? 'app-salary-error' : undefined}
			>
				{#each SALARY_SHAPES as s (s.value)}
					<option value={s.value}>{s.label}</option>
				{/each}
			</select>
		</div>

		{#if shape !== 'none'}
			<div class="space-y-1.5">
				<label
					for="app-salary-currency"
					class="block text-xs font-medium tracking-wide text-muted uppercase">Currency</label
				>
				<select id="app-salary-currency" bind:value={currency} class={inputClass}>
					{#each CURRENCIES as c (c.code)}
						<option value={c.code}>{c.code} — {c.label}</option>
					{/each}
				</select>
			</div>
		{/if}
	</div>

	{#if shape === 'exact'}
		<div class="space-y-1.5">
			<label
				for="app-salary-exact"
				class="block text-xs font-medium tracking-wide text-muted uppercase">Amount</label
			>
			<input
				id="app-salary-exact"
				type="number"
				min="0"
				step="any"
				bind:value={exact}
				placeholder="e.g. 120000"
				class="{inputClass} placeholder:text-muted"
				aria-invalid={error ? 'true' : undefined}
				aria-describedby={error ? 'app-salary-error' : undefined}
			/>
		</div>
	{:else if shape === 'range'}
		<div class="grid grid-cols-2 gap-3">
			<div class="space-y-1.5">
				<label
					for="app-salary-min"
					class="block text-xs font-medium tracking-wide text-muted uppercase">Minimum</label
				>
				<input
					id="app-salary-min"
					type="number"
					min="0"
					step="any"
					bind:value={min}
					placeholder="e.g. 100000"
					class="{inputClass} placeholder:text-muted"
					aria-invalid={error ? 'true' : undefined}
					aria-describedby={error ? 'app-salary-error' : undefined}
				/>
			</div>
			<div class="space-y-1.5">
				<label
					for="app-salary-max"
					class="block text-xs font-medium tracking-wide text-muted uppercase">Maximum</label
				>
				<input
					id="app-salary-max"
					type="number"
					min="0"
					step="any"
					bind:value={max}
					placeholder="e.g. 140000"
					class="{inputClass} placeholder:text-muted"
					aria-invalid={error ? 'true' : undefined}
					aria-describedby={error ? 'app-salary-error' : undefined}
				/>
			</div>
		</div>
	{:else if shape === 'min_only'}
		<div class="space-y-1.5">
			<label
				for="app-salary-min2"
				class="block text-xs font-medium tracking-wide text-muted uppercase">Minimum</label
			>
			<input
				id="app-salary-min2"
				type="number"
				min="0"
				step="any"
				bind:value={min}
				placeholder="e.g. 100000"
				class="{inputClass} placeholder:text-muted"
				aria-invalid={error ? 'true' : undefined}
				aria-describedby={error ? 'app-salary-error' : undefined}
			/>
		</div>
	{:else if shape === 'max_only'}
		<div class="space-y-1.5">
			<label
				for="app-salary-max2"
				class="block text-xs font-medium tracking-wide text-muted uppercase">Maximum</label
			>
			<input
				id="app-salary-max2"
				type="number"
				min="0"
				step="any"
				bind:value={max}
				placeholder="e.g. 140000"
				class="{inputClass} placeholder:text-muted"
				aria-invalid={error ? 'true' : undefined}
				aria-describedby={error ? 'app-salary-error' : undefined}
			/>
		</div>
	{/if}

	{#if error}
		<p id="app-salary-error" class="text-xs text-danger" role="alert">{error}</p>
	{/if}
</fieldset>
